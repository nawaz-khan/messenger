-- 1. F-1: Helper function to check membership without recursion
CREATE OR REPLACE FUNCTION public.is_member_of(check_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.conversation_members 
        WHERE conversation_id = check_conversation_id 
        AND user_id = auth.uid()
    );
END;
$$;

-- Apply helper to conversations
DROP POLICY IF EXISTS "Users can view conversations they belong to" ON public.conversations;
CREATE POLICY "Users can view conversations they belong to" 
ON public.conversations FOR SELECT 
USING (public.is_member_of(id));

-- F-2: Add policy to allow members to update conversations (specifically updated_at)
CREATE POLICY "Users can update their conversations"
ON public.conversations FOR UPDATE
USING (public.is_member_of(id));

-- Apply helper to conversation_members
DROP POLICY IF EXISTS "Users can view members of their conversations" ON public.conversation_members;
CREATE POLICY "Users can view members of their conversations"
ON public.conversation_members FOR SELECT
USING (public.is_member_of(conversation_id));

-- Apply helper to messages
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
USING (public.is_member_of(conversation_id));

DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.messages;
CREATE POLICY "Users can insert messages in their conversations"
ON public.messages FOR INSERT
WITH CHECK (
    (auth.uid() = sender_id OR sender_id IS NULL) AND 
    public.is_member_of(conversation_id)
);

-- 2. F-3: Message history persistence (soft delete / SET NULL on sender_id)
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. F-5: Message length constraint
ALTER TABLE public.messages ADD CONSTRAINT messages_content_length_check CHECK (char_length(content) <= 5000);

-- 4. F-7: Harden existing SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id uuid)
RETURNS uuid AS $$
DECLARE
    conv_id uuid;
    my_id uuid := auth.uid();
    p1 uuid := LEAST(my_id, other_user_id);
    p2 uuid := GREATEST(my_id, other_user_id);
    hash text := p1::text || '_' || p2::text;
BEGIN
    IF my_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF my_id = other_user_id THEN
        RAISE EXCEPTION 'Cannot create a direct conversation with yourself';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
