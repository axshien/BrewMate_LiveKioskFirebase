-- ==============================================================================
-- Migration: Create chill_kiosk_sessions table for secure customer sessions
-- ChillVentoryx Kiosk Ordering System
-- ==============================================================================

-- 1. Table: chill_kiosk_sessions
CREATE TABLE IF NOT EXISTS public.chill_kiosk_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    user_agent TEXT,
    ip_address TEXT,
    orders_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT chk_kiosk_session_status CHECK (status IN ('active', 'expired', 'closed_by_kiosk', 'invalidated'))
);

-- 2. Indexes for fast authentication lookups and expiration scanning
CREATE INDEX IF NOT EXISTS idx_chill_kiosk_sessions_lookup 
ON public.chill_kiosk_sessions (id, token_hash, status);

CREATE INDEX IF NOT EXISTS idx_chill_kiosk_sessions_expires_at 
ON public.chill_kiosk_sessions (expires_at) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_chill_kiosk_sessions_created_at 
ON public.chill_kiosk_sessions (created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.chill_kiosk_sessions ENABLE ROW LEVEL SECURITY;

-- Block public/anon users from directly querying or tampering with session records.
-- All session creations, validations, activity touches, and invalidations
-- are strictly handled server-side by the Supabase Edge Function via the service_role key.
DROP POLICY IF EXISTS "Deny public anon direct access to chill_kiosk_sessions" ON public.chill_kiosk_sessions;
CREATE POLICY "Deny public anon direct access to chill_kiosk_sessions"
ON public.chill_kiosk_sessions
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 4. Stored Procedure: Atomic session touch
-- Atomically extends the session inactivity deadline by 5 minutes ONLY if
-- the session is currently active and has not yet expired.
CREATE OR REPLACE FUNCTION public.kiosk_touch_session(p_session_id UUID, p_token_hash TEXT)
RETURNS TABLE(id UUID, last_activity_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, is_valid BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.chill_kiosk_sessions
  SET 
    last_activity_at = NOW(),
    expires_at = NOW() + INTERVAL '5 minutes'
  WHERE public.chill_kiosk_sessions.id = p_session_id
    AND public.chill_kiosk_sessions.token_hash = p_token_hash
    AND public.chill_kiosk_sessions.status = 'active'
    AND public.chill_kiosk_sessions.expires_at > NOW()
  RETURNING public.chill_kiosk_sessions.id, public.chill_kiosk_sessions.last_activity_at, public.chill_kiosk_sessions.expires_at, TRUE;
  
  -- If session was not updated because it reached its inactivity deadline, mark as expired
  IF NOT FOUND THEN
    UPDATE public.chill_kiosk_sessions
    SET status = 'expired'
    WHERE public.chill_kiosk_sessions.id = p_session_id
      AND public.chill_kiosk_sessions.token_hash = p_token_hash
      AND public.chill_kiosk_sessions.status = 'active'
      AND public.chill_kiosk_sessions.expires_at <= NOW();
  END IF;
END;
$$;

-- 5. Maintenance / Cleanup: Clean up old expired session records (retention: 7 days)
CREATE OR REPLACE FUNCTION public.kiosk_cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Mark overdue active sessions as expired
  UPDATE public.chill_kiosk_sessions
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= NOW();

  -- Delete stale session records older than 7 days
  WITH deleted AS (
    DELETE FROM public.chill_kiosk_sessions
    WHERE expires_at < (NOW() - INTERVAL '7 days')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  
  RETURN v_count;
END;
$$;

-- 6. Ensure chill_kiosk_queue has special_instructions and notes columns
ALTER TABLE public.chill_kiosk_queue 
ADD COLUMN IF NOT EXISTS special_instructions TEXT;

ALTER TABLE public.chill_kiosk_queue 
ADD COLUMN IF NOT EXISTS notes TEXT;
