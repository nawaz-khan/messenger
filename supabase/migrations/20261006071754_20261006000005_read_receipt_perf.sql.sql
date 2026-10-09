ALTER TABLE public.message_read_receipts
ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- Backfill conversation_id
UPDATE public.message_read_receipts r
SET conversation_id = m.conversation_id
FROM public.messages m
WHERE r.message_id = m.id
  AND r.conversation_id IS NULL;

-- Make it NOT NULL for future
ALTER TABLE public.message_read_receipts
ALTER COLUMN conversation_id SET NOT NULL;

-- Add foreign key
ALTER TABLE public.message_read_receipts
DROP CONSTRAINT IF EXISTS message_read_receipts_conversation_id_fkey;

ALTER TABLE public.message_read_receipts
ADD CONSTRAINT message_read_receipts_conversation_id_fkey
FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can see read receipts in their conversations" ON public.message_read_receipts;
DROP POLICY IF EXISTS "Users can create their own read receipts" ON public.message_read_receipts;
DROP POLICY IF EXISTS "Users can update their own read receipts" ON public.message_read_receipts;

-- Create simpler policies relying on conversation_members directly
CREATE POLICY "Users can see read receipts in their conversations"
ON public.message_read_receipts FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = message_read_receipts.conversation_id
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create their own read receipts"
ON public.message_read_receipts FOR INSERT
WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own read receipts"
ON public.message_read_receipts FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Update the RPC to insert conversation_id
CREATE OR REPLACE FUNCTION public.mark_conversation_read(conv_id uuid)
RETURNS void AS $$
DECLARE
    my_id uuid := auth.uid();
BEGIN
    IF my_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Ensure member
    IF NOT EXISTS (
        SELECT 1 FROM public.conversation_members
        WHERE conversation_id = conv_id AND user_id = my_id
    ) THEN
        RAISE EXCEPTION 'Not a member';
    END IF;

    INSERT INTO public.message_read_receipts (message_id, user_id, conversation_id, read_at)
    SELECT id, my_id, conv_id, now()
    FROM public.messages
    WHERE conversation_id = conv_id
      AND sender_id != my_id
      AND NOT EXISTS (
          SELECT 1 FROM public.message_read_receipts r 
          WHERE r.message_id = messages.id AND r.user_id = my_id
      )
    ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
