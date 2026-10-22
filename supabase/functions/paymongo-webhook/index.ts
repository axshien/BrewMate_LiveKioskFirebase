import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

async function verifyPayMongoSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): Promise<boolean> {
  if (!signatureHeader || !webhookSecret) return false;

  try {
    // PayMongo signature format: t=<timestamp>,te=<test_signature>,li=<live_signature>
    const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
      const [key, val] = part.trim().split("=");
      if (key && val) acc[key] = val;
      return acc;
    }, {});

    const timestamp = parts["t"];
    const testSig = parts["te"];
    const liveSig = parts["li"];
    const signature = testSig || liveSig;

    if (!timestamp || !signature) return false;

    // Signed payload is `<timestamp>.<rawBody>`
    const signedPayload = `${timestamp}.${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
    const computedHex = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedHex.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.error("PayMongo signature verification exception:", err);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, paymongo-signature",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "Server credentials configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paymongo-signature");

  // Validate webhook signature if secret configured
  if (webhookSecret) {
    const isValid = await verifyPayMongoSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.warn("Invalid PayMongo webhook signature rejected.");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type;
    const eventData = event?.data?.attributes?.data;

    // Supported events: checkout_session.payment.paid or payment.paid
    const checkoutRef =
      eventData?.attributes?.reference_number ||
      eventData?.attributes?.description?.match(/#([0-9]{4,6})/)?.[1] ||
      eventData?.attributes?.payments?.[0]?.attributes?.description?.match(/#([0-9]{4,6})/)?.[1] ||
      null;

    const checkoutSessionId =
      eventData?.type === "checkout_session"
        ? eventData?.id
        : (eventData?.attributes?.checkout_session_id || null);

    const paymentId =
      eventData?.type === "payment"
        ? eventData?.id
        : (eventData?.attributes?.payments?.[0]?.id || null);

    const paymentMethodType =
      eventData?.attributes?.payment_method_used ||
      eventData?.attributes?.payments?.[0]?.attributes?.source?.type ||
      eventData?.attributes?.source?.type ||
      "";

    const paymentMethodLabel = paymentMethodType
      ? `PayMongo (${paymentMethodType.toUpperCase()}) (TEST MODE)`
      : "PayMongo Cashless (TEST MODE)";

    const nowIso = new Date().toISOString();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Build update payload: update payment_status and POS status to 'paid' authoritatively
    const updatePayload: Record<string, unknown> = {
      payment_status: "PAID",
      status: "paid", // Authoritative POS status: confirmed paid
      paymentmethod: paymentMethodLabel,
    };

    if (checkoutSessionId) {
      updatePayload.payment_reference = checkoutSessionId;
    } else if (paymentId) {
      updatePayload.payment_reference = paymentId;
    }

    let recordsUpdated = 0;

    // 1. Primary lookup by kiosk order number
    if (checkoutRef) {
      // First attempt with updatedat
      let { data: updatedQueue, error: queueErr } = await supabaseAdmin
        .from("chill_kiosk_queue")
        .update({ ...updatePayload, updatedat: nowIso })
        .eq("kioskordernumber", String(checkoutRef))
        .select();

      if (queueErr && (queueErr.code === "42703" || queueErr.message?.includes("updatedat"))) {
        // Fallback without updatedat if column does not exist
        const fbResult = await supabaseAdmin
          .from("chill_kiosk_queue")
          .update(updatePayload)
          .eq("kioskordernumber", String(checkoutRef))
          .select();
        updatedQueue = fbResult.data;
        queueErr = fbResult.error;
      }

      if (queueErr) {
        console.error("Failed to update payment_status by order number:", queueErr);
      } else {
        recordsUpdated = updatedQueue?.length || 0;
        console.log(`Successfully verified order #${checkoutRef} as PAID (updated ${recordsUpdated} rows)`);
      }
    }

    // 2. Fallback lookup by payment_reference if order number didn't match
    if (recordsUpdated === 0 && checkoutSessionId) {
      let { data: refUpdated, error: refErr } = await supabaseAdmin
        .from("chill_kiosk_queue")
        .update({ ...updatePayload, updatedat: nowIso })
        .eq("payment_reference", checkoutSessionId)
        .select();

      if (refErr && (refErr.code === "42703" || refErr.message?.includes("updatedat"))) {
        const refFb = await supabaseAdmin
          .from("chill_kiosk_queue")
          .update(updatePayload)
          .eq("payment_reference", checkoutSessionId)
          .select();
        refUpdated = refFb.data;
        refErr = refFb.error;
      }

      if (!refErr && refUpdated && refUpdated.length > 0) {
        recordsUpdated = refUpdated.length;
        console.log(`Successfully verified payment_reference ${checkoutSessionId} as PAID (updated ${recordsUpdated} rows)`);
      }
    }

    return new Response(JSON.stringify({ received: true, eventType, orderNumber: checkoutRef, updated: recordsUpdated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error processing PayMongo webhook:", err);
    return new Response(JSON.stringify({ error: "Webhook handling error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
