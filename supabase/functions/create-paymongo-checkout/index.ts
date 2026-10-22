import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

// Standard payment method types supported by PayMongo for Philippines test mode (prioritizing GCash)
const DEFAULT_PAYMENT_METHOD_TYPES = [
  "gcash",
  "card",
  "paymaya",
  "grab_pay",
  "dob",
  "billease",
  "qrph",
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paymongoSecretKey = Deno.env.get("PAYMONGO_SECRET_KEY");

  if (!paymongoSecretKey) {
    return jsonResponse(
      {
        success: false,
        error: "PAYMONGO_SECRET_KEY is not configured in Supabase Edge Function environment.",
      },
      500,
      req
    );
  }

  try {
    const body = await req.json();

    // ─────────────────────────────────────────────────────────────────────────────
    // Action 1: Authoritative Payment Verification Check (Session or Order Lookup)
    // ─────────────────────────────────────────────────────────────────────────────
    if (body.action === "verify" || body.action === "check") {
      const queueNumber = String(
        body.kioskordernumber ||
        body.orderNumber ||
        body.queueNumber ||
        body.queue_number ||
        ""
      ).trim();

      const sessionId = body.sessionId || body.checkoutSessionId || null;
      let isPaid = false;
      let orderRecord: Record<string, unknown> | null = null;

      if (supabaseUrl && supabaseServiceKey && queueNumber) {
        try {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
          const { data: dbOrder } = await supabaseAdmin
            .from("chill_kiosk_queue")
            .select("*")
            .eq("kioskordernumber", queueNumber)
            .maybeSingle();

          orderRecord = dbOrder;
          const pStatus = (dbOrder?.payment_status || "").toUpperCase();
          const ordStatus = (dbOrder?.status || "").toLowerCase();

          if (pStatus === "PAID" || ordStatus === "paid") {
            isPaid = true;
          } else {
            // Check directly with PayMongo API using checkout session ID
            const targetSessionId = sessionId || dbOrder?.payment_reference;
            if (targetSessionId && typeof targetSessionId === "string" && targetSessionId.startsWith("cs_")) {
              const authHeader = `Basic ${btoa(paymongoSecretKey.trim() + ":")}`;
              const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${targetSessionId}`, {
                headers: { Authorization: authHeader },
              });

              if (pmRes.ok) {
                const pmData = await pmRes.json();
                const sessionAttrs = pmData?.data?.attributes;
                const payments = sessionAttrs?.payments || [];
                const hasPaidPayment = payments.some((p: any) => p?.attributes?.status === "paid");
                const intentStatus = sessionAttrs?.payment_intent?.attributes?.status;

                if (hasPaidPayment || intentStatus === "succeeded") {
                  isPaid = true;
                  const payType = payments[0]?.attributes?.source?.type || "GCash";
                  const payMethodLabel = `PayMongo (${payType.toUpperCase()}) (TEST MODE)`;

                  await supabaseAdmin
                    .from("chill_kiosk_queue")
                    .update({
                      payment_status: "PAID",
                      status: "paid",
                      paymentmethod: payMethodLabel,
                      updatedat: new Date().toISOString(),
                    })
                    .eq("kioskordernumber", queueNumber);

                  if (orderRecord) {
                    orderRecord.payment_status = "PAID";
                    orderRecord.status = "paid";
                    orderRecord.paymentmethod = payMethodLabel;
                  }
                }
              }
            }
          }
        } catch (vErr) {
          console.warn("Payment verification exception:", vErr);
        }
      }

      return jsonResponse(
        {
          success: true,
          paid: isPaid,
          orderNumber: queueNumber,
          order: orderRecord,
        },
        200,
        req
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Action 2: Create PayMongo Hosted Checkout Session
    // ─────────────────────────────────────────────────────────────────────────────
    // Accept queue number and items using all possible field name variants
    const queueNumber = String(
      body.kioskordernumber ||
      body.orderNumber ||
      body.queueNumber ||
      body.queue_number ||
      ""
    ).trim();

    const items = Array.isArray(body.items)
      ? body.items
      : (Array.isArray(body.cartItems) ? body.cartItems : (Array.isArray(body.cart) ? body.cart : []));

    const {
      customerName,
      customerEmail,
      customerPhone,
      totalAmount,
      total,
      amount,
      successUrl,
      cancelUrl,
      paymentMethodTypes,
    } = body;

    if (!queueNumber || !items || !Array.isArray(items) || items.length === 0) {
      return jsonResponse(
        { success: false, error: "Missing order queue number or cart items." },
        400,
        req
      );
    }

    // Authoritative backend validation against chill_kiosk_queue if record exists
    let verifiedTotal = Number(totalAmount || total || amount) || 0;
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const { data: dbOrder } = await supabaseAdmin
          .from("chill_kiosk_queue")
          .select("totalamount, items, status")
          .eq("kioskordernumber", queueNumber)
          .maybeSingle();

        if (dbOrder && dbOrder.totalamount != null && Number(dbOrder.totalamount) > 0) {
          verifiedTotal = Number(dbOrder.totalamount);
        }
      } catch (dbErr) {
        console.warn("DB verification lookup warning:", dbErr);
      }
    }

    // Fallback calculation from items if verifiedTotal is 0
    if (verifiedTotal <= 0) {
      verifiedTotal = items.reduce(
        (acc: number, it: any) => acc + (Number(it.price || 0) * Math.max(1, Number(it.qty || 1))),
        0
      );
    }

    // Build rich PayMongo line items in centavos (PHP * 100)
    // deno-lint-ignore no-explicit-any
    const lineItems = items.map((it: any) => {
      const unitCentavos = Math.round(Number(it.price || 0) * 100);
      const qty = Math.max(1, Number(it.qty || 1));
      const itemName = String(it.displayName || it.name || "Menu Item").trim();

      // Format clean line item description for PayMongo Checkout page summary
      const descParts: string[] = [];
      if (it.flavorName) {
        descParts.push(`Flavor: ${it.flavorName}`);
      }
      if (it.addons && Array.isArray(it.addons) && it.addons.length > 0) {
        const addonList = it.addons
          .map((a: any) => {
            const aQty = Number(a.qty) || 1;
            const aName = String(a.addonsName || a.name || "").trim();
            const aSub = a.subSelection ? ` (${a.subSelection})` : "";
            return aName ? `${aQty > 1 ? aQty + "x " : ""}${aName}${aSub}` : null;
          })
          .filter(Boolean)
          .join(", ");
        if (addonList) descParts.push(`Add-ons: ${addonList}`);
      }
      if (it.special_instructions || it.notes) {
        const note = String(it.special_instructions || it.notes).trim();
        if (note) descParts.push(`Note: ${note}`);
      } else if (it.desc && typeof it.desc === "string" && it.desc.trim().length > 0) {
        descParts.push(it.desc.trim().slice(0, 100));
      }

      const itemObj: Record<string, unknown> = {
        name: itemName,
        amount: unitCentavos,
        currency: "PHP",
        quantity: qty,
      };

      if (descParts.length > 0) {
        itemObj.description = descParts.join(" | ").slice(0, 255);
      }

      // Valid absolute image URL if provided
      if (
        it.imageUrl &&
        typeof it.imageUrl === "string" &&
        (it.imageUrl.startsWith("http://") || it.imageUrl.startsWith("https://"))
      ) {
        itemObj.images = [it.imageUrl];
      }

      return itemObj;
    });

    // Ensure sum of line items matches target centavos exactly
    const targetCentavos = Math.round(verifiedTotal * 100);
    const currentSumCentavos = lineItems.reduce(
      (sum: number, it: any) => sum + (Number(it.amount || 0) * Number(it.quantity || 1)),
      0
    );
    const diffCentavos = targetCentavos - currentSumCentavos;
    if (diffCentavos !== 0 && lineItems.length > 0) {
      // Adjust the last line item amount if discrepancy is within 100 centavos (rounding variance)
      const last = lineItems[lineItems.length - 1];
      const lastQty = Number(last.quantity) || 1;
      if (Math.abs(diffCentavos) <= 100 && diffCentavos % lastQty === 0) {
        last.amount = Number(last.amount) + (diffCentavos / lastQty);
      }
    }

    // Billing info construction (only include populated fields)
    const billing: Record<string, string> = {
      name: String(customerName || "Kiosk Customer").trim(),
    };
    if (customerEmail && typeof customerEmail === "string" && customerEmail.includes("@")) {
      billing.email = customerEmail.trim();
    }
    if (customerPhone && typeof customerPhone === "string" && customerPhone.trim().length > 0) {
      billing.phone = customerPhone.trim();
    }

    // Compute return URLs with fallback to origin header using the actual queue number
    const originHeader = req.headers.get("origin") || req.headers.get("referer") || "https://brewmatekioskprototype.web.app";
    const cleanOrigin = originHeader.split("?")[0].replace(/\/$/, "");

    const finalSuccessUrl =
      successUrl ||
      `${cleanOrigin}?payment_status=check&orderNumber=${queueNumber}`;
    const finalCancelUrl =
      cancelUrl ||
      `${cleanOrigin}?payment_status=cancelled&orderNumber=${queueNumber}`;

    // PayMongo API Basic Auth: base64(secretKey + ":")
    const authHeader = `Basic ${btoa(paymongoSecretKey.trim() + ":")}`;

    // Desired payment method types: allow caller override or defaults (prioritizing GCash)
    const requestedMethods = Array.isArray(paymentMethodTypes) && paymentMethodTypes.length > 0
      ? paymentMethodTypes
      : DEFAULT_PAYMENT_METHOD_TYPES;

    // Helper to send request to PayMongo Checkout Sessions API
    const createSession = async (methods: string[]) => {
      const payload = {
        data: {
          attributes: {
            billing,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            description: `ChillVentoryx Kiosk Order #${queueNumber} (TEST MODE)`,
            line_items: lineItems,
            payment_method_types: methods,
            reference_number: String(queueNumber),
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
          },
        },
      };

      const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      return { ok: res.ok, status: res.status, data: resData };
    };

    // Attempt 1: All supported test payment methods (GCash, Card, PayMaya, GrabPay, DOB, BillEase, QRPh)
    let apiResult = await createSession(requestedMethods);

    // If PayMongo rejects with an error related to specific payment method types not enabled on account,
    // fallback gracefully to primary test channels (GCash, Card, PayMaya, GrabPay)
    if (!apiResult.ok && apiResult.data?.errors) {
      const errDetail = JSON.stringify(apiResult.data.errors).toLowerCase();
      if (errDetail.includes("payment_method_type") || errDetail.includes("not enabled") || errDetail.includes("invalid")) {
        console.warn("Retrying PayMongo checkout session with standard primary methods...");
        apiResult = await createSession(["gcash", "card", "paymaya", "grab_pay"]);
      }
    }

    if (!apiResult.ok || !apiResult.data?.data?.attributes?.checkout_url) {
      console.error("PayMongo API creation error:", apiResult.data);
      const firstErr =
        apiResult.data?.errors?.[0]?.detail ||
        apiResult.data?.errors?.[0]?.title ||
        "Failed to create PayMongo checkout session";
      return jsonResponse({ success: false, error: firstErr }, apiResult.status || 500, req);
    }

    const checkoutUrl = apiResult.data.data.attributes.checkout_url;
    const checkoutSessionId = apiResult.data.data.id;

    // Authoritatively link payment reference and mark payment_status = PENDING in chill_kiosk_queue
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const updateFields: Record<string, unknown> = {
          payment_reference: checkoutSessionId,
          paymentmethod: "PayMongo Cashless (TEST MODE)",
          payment_status: "PENDING",
        };

        const { error: updErr } = await supabaseAdmin
          .from("chill_kiosk_queue")
          .update(updateFields)
          .eq("kioskordernumber", queueNumber);

        if (updErr && updErr.code === "42703") {
          // Schema column fallback if payment_status or payment_reference doesn't exist
          await supabaseAdmin
            .from("chill_kiosk_queue")
            .update({ paymentmethod: "PayMongo Cashless (TEST MODE)" })
            .eq("kioskordernumber", queueNumber);
        }
      } catch (err) {
        console.warn("Could not record payment_reference in chill_kiosk_queue:", err);
      }
    }

    return jsonResponse(
      {
        success: true,
        checkoutUrl,
        checkout_url: checkoutUrl,
        sessionId: checkoutSessionId,
        id: checkoutSessionId,
        orderNumber: queueNumber,
        queueNumber: queueNumber,
        kioskordernumber: queueNumber,
      },
      200,
      req
    );
  } catch (error) {
    console.error("Checkout session handler exception:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal error creating checkout session",
      },
      500,
      req
    );
  }
});
