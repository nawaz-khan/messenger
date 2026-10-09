-- migration 20261006000004_messaging_fixes.sql

-- 1. Prevent creating a conversation if blocked
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id uuid)
RETURNS uuid AS $$
DECLARE
    conv_id uuid;
    my_id uuid := auth.uid();
    p1 uuid := LEAST(my_id, other_user_id);
    p2 uuid := GREATEST(my_id, other_user_id);
    hash text := p1::text || '_' || p2::text;
    block_exists boolean;
BEGIN
    IF my_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF my_id = other_user_id THEN
        RAISE EXCEPTION 'Cannot create a direct conversation with yourself';
    END IF;

    -- Check block
    SELECT EXISTS (
        SELECT 1 FROM public.blocked_users 
        WHERE (blocker_id = my_id AND blocked_id = other_user_id)
           OR (blocker_id = other_user_id AND blocked_id = my_id)
    ) INTO block_exists;

    IF block_exists THEN
        RAISE EXCEPTION 'BLOCKED';
    END IF;

    -- Try to find existing
    SELECT id INTO conv_id
    FROM public.conversations
    WHERE direct_participant_hash = hash;

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    -- Insert safely with unique constraint taking care of concurrency
    BEGIN
        INSERT INTO public.conversations (type, created_by, direct_participant_hash)
        VALUES ('direct', my_id, hash)
        RETURNING id INTO conv_id;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES 
            (conv_id, p1, 'member'),
            (conv_id, p2, 'member');
            
    EXCEPTION WHEN unique_violation THEN
        -- If concurrent request inserted it first, catch the violation and retrieve the ID
        SELECT id INTO conv_id
        FROM public.conversations
        WHERE direct_participant_hash = hash;
    END;

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Trigger on messages to prevent sending if blocked
CREATE OR REPLACE FUNCTION public.check_message_block()
RETURNS trigger AS $$
DECLARE
    conv_type text;
    other_uid uuid;
BEGIN
    SELECT type INTO conv_type FROM public.conversations WHERE id = NEW.conversation_id;
    
    IF conv_type = 'direct' THEN
        SELECT user_id INTO other_uid 
        FROM public.conversation_members 
        WHERE conversation_id = NEW.conversation_id AND user_id != NEW.sender_id
        LIMIT 1;
        
        IF EXISTS (
            SELECT 1 FROM public.blocked_users
            WHERE (blocker_id = NEW.sender_id AND blocked_id = other_uid)
               OR (blocker_id = other_uid AND blocked_id = NEW.sender_id)
        ) THEN
            RAISE EXCEPTION 'BLOCKED';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_message_block_trigger ON public.messages;
CREATE TRIGGER enforce_message_block_trigger
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.check_message_block();


-- 3. Message Read Receipts
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at timestamptz DEFAULT now(),
    UNIQUE (message_id, user_id)
);

ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see read receipts in their conversations"
ON public.message_read_receipts FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = message_read_receipts.message_id
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create their own read receipts"
ON public.message_read_receipts FOR INSERT
WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = message_id
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own read receipts"
ON public.message_read_receipts FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- 4. Mark Conversation Read RPC
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

    INSERT INTO public.message_read_receipts (message_id, user_id, read_at)
    SELECT id, my_id, now()
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


-- Enable Realtime for read receipts
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;
