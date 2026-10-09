-- Security definer helper to break RLS recursion during Realtime evaluation
CREATE OR REPLACE FUNCTION public.is_conversation_member(target_conversation_id uuid, target_user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.conversation_members
        WHERE conversation_id = target_conversation_id AND user_id = target_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure conversation_id column exists
ALTER TABLE public.message_read_receipts
ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- Backfill conversation_id if any nulls remain
UPDATE public.message_read_receipts r
SET conversation_id = m.conversation_id
FROM public.messages m
WHERE r.message_id = m.id
  AND r.conversation_id IS NULL;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can see read receipts in their conversations" ON public.message_read_receipts;
DROP POLICY IF EXISTS "Users can create their own read receipts" ON public.message_read_receipts;
DROP POLICY IF EXISTS "Users can update their own read receipts" ON public.message_read_receipts;

-- Re-create clean RLS policies using security definer helper
CREATE POLICY "Users can see read receipts in their conversations"
ON public.message_read_receipts FOR SELECT
USING (
    public.is_conversation_member(conversation_id, auth.uid())
);

CREATE POLICY "Users can create their own read receipts"
ON public.message_read_receipts FOR INSERT
WITH CHECK (
    user_id = auth.uid() AND
    public.is_conversation_member(conversation_id, auth.uid())
);

CREATE POLICY "Users can update their own read receipts"
ON public.message_read_receipts FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Ensure Realtime publication includes message_read_receipts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'message_read_receipts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;
    END IF;
END $$;

-- Update RPC to be SECURITY DEFINER with search_path = public
CREATE OR REPLACE FUNCTION public.mark_conversation_read(conv_id uuid)
RETURNS void AS $$
DECLARE
    my_id uuid := auth.uid();
BEGIN
    IF my_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT public.is_conversation_member(conv_id, my_id) THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
