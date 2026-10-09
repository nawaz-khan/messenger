CREATE TABLE public.conversations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    type text NOT NULL CHECK (type IN ('direct', 'group')),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    direct_participant_hash text UNIQUE,
    CONSTRAINT conversations_pkey PRIMARY KEY (id),
    CONSTRAINT conversations_direct_participant_hash_check CHECK (
        (type = 'direct' AND direct_participant_hash IS NOT NULL) OR
        (type = 'group' AND direct_participant_hash IS NULL)
    )
);

CREATE TABLE public.conversation_members (
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_read_message_id uuid, 
    CONSTRAINT conversation_members_pkey PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text,
    reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_content_check CHECK (
        (deleted_at IS NOT NULL) OR (content IS NOT NULL AND trim(content) != '')
    )
);

ALTER TABLE public.conversation_members ADD CONSTRAINT fk_last_read_message FOREIGN KEY (last_read_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations RLS
CREATE POLICY "Users can view conversations they belong to" 
ON public.conversations FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm 
        WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
);

-- Conversation Members RLS
CREATE POLICY "Users can view members of their conversations"
ON public.conversation_members FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm 
        WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
);

-- Messages RLS
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm 
        WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert messages in their conversations"
ON public.messages FOR INSERT
WITH CHECK (
    auth.uid() = sender_id AND 
    EXISTS (
        SELECT 1 FROM public.conversation_members cm 
        WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own messages"
ON public.messages FOR UPDATE
USING (auth.uid() = sender_id);

-- Triggers for updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_conversation_members_user_id ON public.conversation_members(user_id);
CREATE INDEX idx_messages_conversation_id_created_at ON public.messages(conversation_id, created_at DESC);

-- RPC for atomic DM creation
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
