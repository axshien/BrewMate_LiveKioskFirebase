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
    const {
      kioskordernumber,
      orderId,
      customerName,
      customerEmail,
      items,
      totalAmount,
      successUrl,
      cancelUrl,
    } = body;

    if (!kioskordernumber || !items || !Array.isArray(items) || items.length === 0) {
      return jsonResponse(
        { success: false, error: "Invalid request payload. Missing order details or items." },
        400,
        req
      );
    }

    // Authoritative backend validation against chill_kiosk_queue
    let verifiedTotal = Number(totalAmount) || 0;
    if (supabaseUrl && supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: dbOrder } = await supabaseAdmin
        .from("chill_kiosk_queue")
        .select("totalamount, items, status")
        .eq("kioskordernumber", String(kioskordernumber))
        .maybeSingle();

      if (dbOrder && dbOrder.totalamount != null) {
        verifiedTotal = Number(dbOrder.totalamount);
      }
    }

    // Build PayMongo line items in centavos (PHP * 100)
    // deno-lint-ignore no-explicit-any
    const lineItems = items.map((it: any) => {
      const unitCentavos = Math.round(Number(it.price || 0) * 100);
      const qty = Math.max(1, Number(it.qty || 1));
      return {
        name: String(it.displayName || it.name || "Menu Item"),
        amount: unitCentavos,
        currency: "PHP",
        quantity: qty,
      };
    });

    // PayMongo API Basic Auth: base64(secretKey + ":")
    const authHeader = `Basic ${btoa(paymongoSecretKey + ":")}`;

    const paymongoPayload = {
      data: {
        attributes: {
          billing: {
            name: String(customerName || "Kiosk Customer").trim(),
            email: customerEmail && customerEmail.includes("@") ? String(customerEmail).trim() : undefined,
          },
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: `ChillVentoryx Kiosk Order #${kioskordernumber} (TEST MODE)`,
          line_items: lineItems,
          payment_method_types: ["card", "gcash", "paymaya", "grab_pay"],
          reference_number: String(kioskordernumber),
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      },
    };

    const paymongoRes = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify(paymongoPayload),
    });

    const resJson = await paymongoRes.json();

    if (!paymongoRes.ok || !resJson?.data?.attributes?.checkout_url) {
      console.error("PayMongo API error:", resJson);
      const firstErr = resJson?.errors?.[0]?.detail || "Failed to create PayMongo checkout session";
      return jsonResponse({ success: false, error: firstErr }, paymongoRes.status || 500, req);
    }

    const checkoutUrl = resJson.data.attributes.checkout_url;
    const checkoutSessionId = resJson.data.id;

    // Record checkout session reference in chill_kiosk_queue if credentials configured
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        await supabaseAdmin
          .from("chill_kiosk_queue")
          .update({
            payment_reference: checkoutSessionId,
            paymentmethod: "PayMongo Cashless (TEST MODE)",
          })
          .eq("kioskordernumber", String(kioskordernumber));
      } catch (err) {
        console.warn("Could not save payment_reference to chill_kiosk_queue:", err);
      }
    }

    return jsonResponse(
      {
        success: true,
        checkoutUrl,
        sessionId: checkoutSessionId,
        orderNumber: kioskordernumber,
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
