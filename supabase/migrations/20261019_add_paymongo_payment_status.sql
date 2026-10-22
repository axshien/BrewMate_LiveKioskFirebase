-- ==============================================================================
-- Migration: Add payment_status to chill_kiosk_queue for PayMongo integration
-- ChillVentoryx Kiosk Ordering System
-- ==============================================================================

-- 1. Add payment_status, payment_reference, and updatedat columns to chill_kiosk_queue
ALTER TABLE public.chill_kiosk_queue 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) DEFAULT 'PENDING';

ALTER TABLE public.chill_kiosk_queue 
ADD COLUMN IF NOT EXISTS payment_reference TEXT;

ALTER TABLE public.chill_kiosk_queue 
ADD COLUMN IF NOT EXISTS updatedat TIMESTAMPTZ DEFAULT NOW();

-- 2. Optional check constraint for known payment states
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_chill_kiosk_queue_payment_status'
    ) THEN
        ALTER TABLE public.chill_kiosk_queue 
        ADD CONSTRAINT chk_chill_kiosk_queue_payment_status 
        CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'));
    END IF;
END $$;

-- 3. Performance index on kioskordernumber and payment_status
CREATE INDEX IF NOT EXISTS idx_chill_kiosk_queue_pay_lookup
ON public.chill_kiosk_queue (kioskordernumber, payment_status);

-- 4. Enable Realtime publication for chill_kiosk_queue if not already enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'chill_kiosk_queue'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chill_kiosk_queue;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if publication doesn't exist or already configured
END $$;
