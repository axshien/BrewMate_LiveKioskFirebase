import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// ═════════════════════════════════════════════════════════════════════════════
// CORS & COOKIE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-kiosk-session-token",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  req: Request,
  cookieHeader?: string | null
): Response {
  const headers = new Headers({
    ...getCorsHeaders(req),
    "Content-Type": "application/json",
  });
  if (cookieHeader) {
    headers.append("Set-Cookie", cookieHeader);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function buildSessionCookie(token: string, maxAgeSeconds = 300): string {
  // SameSite=None; Secure; HttpOnly for cross-site API fetch compatibility
  return `chill_kiosk_session=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=None; Secure; HttpOnly`;
}

function clearSessionCookie(): string {
  return `chill_kiosk_session=; Path=/; Max-Age=0; SameSite=None; Secure; HttpOnly`;
}

// ═════════════════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC HELPERS (Native Web Crypto API)
// ═════════════════════════════════════════════════════════════════════════════

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSessionToken(): { sessionId: string; secretToken: string; fullToken: string } {
  const sessionId = crypto.randomUUID();
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const secretToken = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const fullToken = `${sessionId}.${secretToken}`;
  return { sessionId, secretToken, fullToken };
}

function parseToken(rawToken: string): { sessionId: string; secretToken: string } | null {
  if (!rawToken || typeof rawToken !== "string") return null;
  const trimmed = rawToken.trim();
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex === -1) return null;

  const sessionId = trimmed.substring(0, dotIndex);
  const secretToken = trimmed.substring(dotIndex + 1);

  // Validate UUID v4 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) return null;

  // Validate 64-character hex secret token
  if (!/^[0-9a-f]{64}$/i.test(secretToken)) return null;

  return { sessionId, secretToken };
}

function extractSessionToken(req: Request, body?: { token?: string }): string | null {
  // 1. Custom header: X-Kiosk-Session-Token
  const customHeader = req.headers.get("x-kiosk-session-token");
  if (customHeader && customHeader.trim()) {
    return customHeader.trim();
  }

  // 2. Cookie header: chill_kiosk_session
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const c of cookies) {
      if (c.startsWith("chill_kiosk_session=")) {
        const val = decodeURIComponent(c.substring("chill_kiosk_session=".length).trim());
        if (val) return val;
      }
    }
  }

  // 3. Authorization Bearer header (if contains dot and not the raw anon JWT)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const candidate = authHeader.substring(7).trim();
    if (candidate.includes(".") && candidate !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const parsed = parseToken(candidate);
      if (parsed) return candidate;
    }
  }

  // 4. Request JSON body token property
  if (body && typeof body.token === "string" && body.token.trim()) {
    return body.token.trim();
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// KIOSK SETTINGS CHECK
// ═════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function checkIsKioskOpen(supabaseAdmin: any): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("chill_kiosk_settings")
      .select("is_open")
      .limit(1)
      .maybeSingle();

    if (!error && data && data.is_open !== undefined && data.is_open !== null) {
      const raw = data.is_open;
      return !(
        raw === false ||
        raw === 0 ||
        String(raw).trim().toLowerCase() === "false" ||
        String(raw).trim() === "0"
      );
    }

    // Fallback table kiosk_setting
    const { data: fbData, error: fbErr } = await supabaseAdmin
      .from("kiosk_setting")
      .select("is_open")
      .limit(1)
      .maybeSingle();

    if (!fbErr && fbData && fbData.is_open !== undefined && fbData.is_open !== null) {
      const raw = fbData.is_open;
      return !(
        raw === false ||
        raw === 0 ||
        String(raw).trim().toLowerCase() === "false" ||
        String(raw).trim() === "0"
      );
    }

    return true; // Default open if no record exists
  } catch (err) {
    console.warn("Error verifying kiosk settings:", err);
    return true;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE FUNCTION ENTRYPOINT
// ═════════════════════════════════════════════════════════════════════════════

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse(
      {
        success: false,
        code: "SERVER_CONFIG_ERROR",
        message: "Supabase service credentials not configured.",
      },
      500,
      req
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = (body.action || "").trim();
  const rawToken = extractSessionToken(req, body);
  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
  const userAgent = req.headers.get("user-agent") || null;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: CREATE SESSION (QR Code entry)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "create") {
      const isOpen = await checkIsKioskOpen(supabaseAdmin);
      if (!isOpen) {
        return jsonResponse(
          {
            success: false,
            code: "KIOSK_CLOSED",
            message:
              "Sorry, the ChillVentoryx self-service kiosk is currently closed and unavailable for ordering.",
          },
          403,
          req
        );
      }

      const { sessionId, secretToken, fullToken } = generateSessionToken();
      const tokenHash = await sha256Hex(secretToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + INACTIVITY_TIMEOUT_MS);

      const { error: insertError } = await supabaseAdmin
        .from("chill_kiosk_sessions")
        .insert([
          {
            id: sessionId,
            token_hash: tokenHash,
            status: "active",
            created_at: now.toISOString(),
            last_activity_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            user_agent: userAgent,
            ip_address: clientIp,
            orders_count: 0,
          },
        ]);

      if (insertError) {
        console.error("Failed to insert session into chill_kiosk_sessions:", insertError);
        return jsonResponse(
          {
            success: false,
            code: "DATABASE_ERROR",
            message: "Failed to initialize secure kiosk session.",
          },
          500,
          req
        );
      }

      const cookieHeader = buildSessionCookie(fullToken, 300);
      return jsonResponse(
        {
          success: true,
          sessionId,
          token: fullToken,
          expiresAt: expiresAt.toISOString(),
          serverTime: now.toISOString(),
          timeoutSeconds: 300,
        },
        200,
        req,
        cookieHeader
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ALL OTHER ACTIONS REQUIRE A VALID SESSION TOKEN
    // ─────────────────────────────────────────────────────────────────────────
    if (!rawToken) {
      return jsonResponse(
        {
          success: false,
          valid: false,
          code: "MISSING_SESSION_TOKEN",
          message: "No session credential provided.",
        },
        401,
        req
      );
    }

    const parsed = parseToken(rawToken);
    if (!parsed) {
      return jsonResponse(
        {
          success: false,
          valid: false,
          code: "INVALID_SESSION_FORMAT",
          message: "Session token format is invalid.",
        },
        401,
        req,
        clearSessionCookie()
      );
    }

    const { sessionId, secretToken } = parsed;
    const tokenHash = await sha256Hex(secretToken);

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: VALIDATE SESSION (Inspect validity without extending inactivity)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "validate") {
      const isOpen = await checkIsKioskOpen(supabaseAdmin);
      if (!isOpen) {
        // Mark session as closed_by_kiosk if it was active
        await supabaseAdmin
          .from("chill_kiosk_sessions")
          .update({ status: "closed_by_kiosk" })
          .eq("id", sessionId)
          .eq("token_hash", tokenHash)
          .eq("status", "active");

        return jsonResponse(
          {
            success: false,
            valid: false,
            code: "KIOSK_CLOSED",
            message:
              "Sorry, the ChillVentoryx self-service kiosk is currently closed and unavailable for ordering.",
          },
          403,
          req
        );
      }

      const { data: sessionRecord, error: sessionErr } = await supabaseAdmin
        .from("chill_kiosk_sessions")
        .select("id, status, expires_at, last_activity_at, created_at")
        .eq("id", sessionId)
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (sessionErr || !sessionRecord) {
        return jsonResponse(
          {
            success: false,
            valid: false,
            code: "INVALID_SESSION",
            message: "Session not found or invalid token.",
          },
          401,
          req,
          clearSessionCookie()
        );
      }

      if (sessionRecord.status !== "active") {
        return jsonResponse(
          {
            success: false,
            valid: false,
            code: "SESSION_EXPIRED",
            status: sessionRecord.status,
            message:
              "Your session has expired due to inactivity. Please scan the ChillVentoryx QR code again to continue.",
          },
          401,
          req,
          clearSessionCookie()
        );
      }

      const nowMs = Date.now();
      const expiresAtMs = new Date(sessionRecord.expires_at).getTime();

      // Check authorative server expiration
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs) {
        await supabaseAdmin
          .from("chill_kiosk_sessions")
          .update({ status: "expired" })
          .eq("id", sessionId)
          .eq("status", "active");

        return jsonResponse(
          {
            success: false,
            valid: false,
            code: "SESSION_EXPIRED",
            message:
              "Your session has expired due to inactivity. Please scan the ChillVentoryx QR code again to continue.",
          },
          401,
          req,
          clearSessionCookie()
        );
      }

      // Valid and unexpired: DO NOT EXTEND DEADLINE (Reopening/refreshing does not reset inactivity)
      return jsonResponse(
        {
          success: true,
          valid: true,
          sessionId: sessionRecord.id,
          expiresAt: sessionRecord.expires_at,
          lastActivityAt: sessionRecord.last_activity_at,
          serverTime: new Date(nowMs).toISOString(),
          remainingSeconds: Math.max(0, Math.round((expiresAtMs - nowMs) / 1000)),
        },
        200,
        req
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: RECORD ACTIVITY / TOUCH (Meaningful customer interaction only)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "touch" || action === "record-activity") {
      const isOpen = await checkIsKioskOpen(supabaseAdmin);
      if (!isOpen) {
        await supabaseAdmin
          .from("chill_kiosk_sessions")
          .update({ status: "closed_by_kiosk" })
          .eq("id", sessionId)
          .eq("token_hash", tokenHash)
          .eq("status", "active");

        return jsonResponse(
          {
            success: false,
            valid: false,
            code: "KIOSK_CLOSED",
            message: "The kiosk has been closed by an administrator.",
          },
          403,
          req
        );
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const newExpiresIso = new Date(now.getTime() + INACTIVITY_TIMEOUT_MS).toISOString();

      // ATOMIC UPDATE: Only update if session is 'active' AND expires_at > nowIso
      // This guarantees an already expired session can NEVER be revived by an activity ping!
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("chill_kiosk_sessions")
        .update({
          last_activity_at: nowIso,
          expires_at: newExpiresIso,
        })
        .eq("id", sessionId)
        .eq("token_hash", tokenHash)
        .eq("status", "active")
        .gt("expires_at", nowIso)
        .select("id, last_activity_at, expires_at")
        .maybeSingle();

      if (updateErr || !updated) {
        // Atomic update failed because session either doesn't exist or already expired
        await supabaseAdmin
          .from("chill_kiosk_sessions")
          .update({ status: "expired" })
          .eq("id", sessionId)
          .eq("status", "active");

        return jsonResponse(
          {
            success: false,
            valid: false,
            code: "SESSION_EXPIRED",
            message:
              "Your session has expired due to inactivity. Please scan the ChillVentoryx QR code again to continue.",
          },
          401,
          req,
          clearSessionCookie()
        );
      }

      return jsonResponse(
        {
          success: true,
          valid: true,
          sessionId: updated.id,
          expiresAt: updated.expires_at,
          lastActivityAt: updated.last_activity_at,
          serverTime: nowIso,
          remainingSeconds: 300,
        },
        200,
        req,
        buildSessionCookie(rawToken, 300)
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: SUBMIT ORDER (Server-validated order creation)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "submit-order") {
      const isOpen = await checkIsKioskOpen(supabaseAdmin);
      if (!isOpen) {
        return jsonResponse(
          {
            success: false,
            code: "KIOSK_CLOSED",
            message: "The kiosk is currently closed. Order cannot be placed.",
          },
          403,
          req
        );
      }

      const now = new Date();
      const nowIso = now.toISOString();

      // Verify active, unexpired session atomically
      const { data: sessionRecord, error: sessionErr } = await supabaseAdmin
        .from("chill_kiosk_sessions")
        .select("id, status, expires_at, orders_count")
        .eq("id", sessionId)
        .eq("token_hash", tokenHash)
        .eq("status", "active")
        .gt("expires_at", nowIso)
        .maybeSingle();

      if (sessionErr || !sessionRecord) {
        // Mark expired if it passed deadline
        await supabaseAdmin
          .from("chill_kiosk_sessions")
          .update({ status: "expired" })
          .eq("id", sessionId)
          .eq("status", "active");

        return jsonResponse(
          {
            success: false,
            code: "SESSION_EXPIRED",
            message:
              "Your session has expired due to inactivity. Please scan the ChillVentoryx QR code again to continue.",
          },
          401,
          req,
          clearSessionCookie()
        );
      }

      const orderPayload = body.orderPayload;
      if (!orderPayload || typeof orderPayload !== "object") {
        return jsonResponse(
          { success: false, code: "INVALID_ORDER_PAYLOAD", message: "Missing order details." },
          400,
          req
        );
      }

      const items = Array.isArray(orderPayload.items) ? orderPayload.items : [];
      if (items.length === 0) {
        return jsonResponse(
          { success: false, code: "EMPTY_CART", message: "Order must contain at least one item." },
          400,
          req
        );
      }

      const customerName = String(orderPayload.customerName || "").trim();
      if (customerName.length < 3) {
        return jsonResponse(
          {
            success: false,
            code: "INVALID_NAME",
            message: "Nickname must be at least 3 characters.",
          },
          400,
          req
        );
      }

      const specialNotes = (orderPayload.special_instructions || orderPayload.notes || orderPayload.instructions || "").trim() || null;

      // Insert into chill_kiosk_queue
      const kioskQueueRecord: Record<string, unknown> = {
        kioskordernumber: String(orderPayload.kioskordernumber || ""),
        customerName: customerName.toUpperCase(),
        customerEmail: orderPayload.customerEmail || null,
        orderType: orderPayload.orderType || "Dine In",
        items: items,
        subtotal: Number(orderPayload.subtotal || orderPayload.totalamount || 0),
        totalamount: Number(orderPayload.totalamount || 0),
        paymentmethod: orderPayload.paymentmethod || "Cash",
        status: "pending",
        special_instructions: specialNotes,
        notes: specialNotes,
      };

      let insertedOrder = null;
      const { data: firstTryOrder, error: insertOrderErr } = await supabaseAdmin
        .from("chill_kiosk_queue")
        .insert([kioskQueueRecord])
        .select()
        .maybeSingle();

      if (!insertOrderErr) {
        insertedOrder = firstTryOrder;
      } else {
        console.warn("Primary order insertion warning in chill_kiosk_queue:", insertOrderErr);
        // Fallback 1: Remove special_instructions and notes if column does not exist (42703)
        if (
          insertOrderErr.code === "42703" ||
          (insertOrderErr.message && (insertOrderErr.message.includes("special_instructions") || insertOrderErr.message.includes("notes")))
        ) {
          delete kioskQueueRecord.special_instructions;
          delete kioskQueueRecord.notes;
        }

        // Fallback 2: Fallback if schema has column named 'email' instead of 'customerEmail'
        if (
          insertOrderErr.code === "42703" ||
          (insertOrderErr.message && insertOrderErr.message.includes("customerEmail"))
        ) {
          delete kioskQueueRecord.customerEmail;
          kioskQueueRecord.email = orderPayload.customerEmail || null;
        }

        const { data: fbInserted, error: fbErr } = await supabaseAdmin
          .from("chill_kiosk_queue")
          .insert([kioskQueueRecord])
          .select()
          .maybeSingle();

        if (fbErr) {
          console.error("Fallback order insertion failed:", fbErr);
          // Fallback 3: stripped minimal insert
          delete kioskQueueRecord.email;
          delete kioskQueueRecord.customerEmail;
          delete kioskQueueRecord.special_instructions;
          delete kioskQueueRecord.notes;
          const { data: minimalInserted, error: minErr } = await supabaseAdmin
            .from("chill_kiosk_queue")
            .insert([kioskQueueRecord])
            .select()
            .maybeSingle();

          if (minErr) {
            console.error("Minimal order insertion failed:", minErr);
            return jsonResponse(
              { success: false, code: "ORDER_SUBMIT_FAILED", message: "Database error creating order." },
              500,
              req
            );
          }
          insertedOrder = minimalInserted;
        } else {
          insertedOrder = fbInserted;
        }
      }

      // Increment orders_count and touch last_activity_at
      await supabaseAdmin
        .from("chill_kiosk_sessions")
        .update({
          orders_count: (sessionRecord.orders_count || 0) + 1,
          last_activity_at: nowIso,
        })
        .eq("id", sessionId);

      return jsonResponse(
        {
          success: true,
          order: insertedOrder,
          orderNumber: orderPayload.kioskordernumber,
        },
        200,
        req
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: INVALIDATE SESSION
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "invalidate") {
      await supabaseAdmin
        .from("chill_kiosk_sessions")
        .update({ status: "invalidated" })
        .eq("id", sessionId)
        .eq("token_hash", tokenHash);

      return jsonResponse({ success: true, message: "Session invalidated." }, 200, req, clearSessionCookie());
    }

    return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400, req);
  } catch (error) {
    console.error("Unhandled exception in kiosk-session Edge Function:", error);
    return jsonResponse(
      {
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred processing session request.",
      },
      500,
      req
    );
  }
});
