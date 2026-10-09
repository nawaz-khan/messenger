-- 1. Modify notifications table
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

-- Update the check constraint to support new types
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('new_message', 'group_invite', 'join_request', 'join_request_approved'));

-- 2. Update trigger for new_message
CREATE OR REPLACE FUNCTION public.handle_new_message_notification()
RETURNS trigger AS $$
DECLARE
    member_record record;
    group_uuid uuid;
BEGIN
    SELECT g.id INTO group_uuid 
    FROM public.conversations c 
    LEFT JOIN public.groups g ON g.conversation_id = c.id 
    WHERE c.id = NEW.conversation_id;

    FOR member_record IN 
        SELECT user_id 
        FROM public.conversation_members 
        WHERE conversation_id = NEW.conversation_id 
        AND user_id != NEW.sender_id
    LOOP
        INSERT INTO public.notifications (user_id, type, reference_id, actor_id, group_id, created_at)
        VALUES (member_record.user_id, 'new_message', NEW.conversation_id, NEW.sender_id, group_uuid, NEW.created_at);
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger for group invitations
CREATE OR REPLACE FUNCTION public.handle_group_invitation_notification()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.notifications (user_id, type, reference_id, actor_id, group_id, created_at)
        VALUES (NEW.invitee_id, 'group_invite', NEW.id, NEW.inviter_id, NEW.group_id, NEW.created_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_group_invitation_created ON public.group_invitations;
CREATE TRIGGER on_group_invitation_created
    AFTER INSERT ON public.group_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_group_invitation_notification();

-- 4. Trigger for group join requests
CREATE OR REPLACE FUNCTION public.handle_group_join_request_notification()
RETURNS trigger AS $$
DECLARE
    owner_uuid uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Notify the group owner
        SELECT cm.user_id INTO owner_uuid
        FROM public.groups g
        JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id
        WHERE g.id = NEW.group_id AND cm.role = 'owner'
        LIMIT 1;

        IF owner_uuid IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, type, reference_id, actor_id, group_id, created_at)
            VALUES (owner_uuid, 'join_request', NEW.id, NEW.user_id, NEW.group_id, NEW.created_at);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_group_join_request_created ON public.group_join_requests;
CREATE TRIGGER on_group_join_request_created
    AFTER INSERT ON public.group_join_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_group_join_request_notification();

-- 5. Fix delete_group RPC
CREATE OR REPLACE FUNCTION public.delete_group(target_group_id uuid)
RETURNS void AS $$
DECLARE
    conv_id uuid;
    my_id uuid := auth.uid();
    my_role text;
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT conversation_id INTO conv_id FROM public.groups WHERE id = target_group_id;
    IF conv_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;

    SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id;
    IF my_role != 'owner' THEN RAISE EXCEPTION 'Only owner can delete group'; END IF;

    -- Deleting the conversation cascades to groups, messages, and members.
    DELETE FROM public.conversations WHERE id = conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update approve_join_request to include actor_id and group_id
CREATE OR REPLACE FUNCTION public.approve_join_request(target_request_id uuid) RETURNS void AS $$
DECLARE
    req_group_id uuid;
    req_user_id uuid;
    req_status text;
    conv_id uuid;
    my_id uuid := auth.uid();
    my_role text;
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT group_id, user_id, status INTO req_group_id, req_user_id, req_status FROM public.group_join_requests WHERE id = target_request_id;
    IF req_group_id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
    IF req_status != 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;

    SELECT g.conversation_id, cm.role INTO conv_id, my_role FROM public.groups g
    LEFT JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id AND cm.user_id = my_id
    WHERE g.id = req_group_id;

    IF my_role NOT IN ('owner', 'moderator') THEN RAISE EXCEPTION 'Not authorized'; END IF;

    UPDATE public.group_join_requests SET status = 'approved', updated_at = now() WHERE id = target_request_id;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = req_user_id) THEN
        INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (conv_id, req_user_id, 'member');
    END IF;
    
    INSERT INTO public.notifications (user_id, type, reference_id, actor_id, group_id) 
    VALUES (req_user_id, 'join_request_approved', target_request_id, my_id, req_group_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
