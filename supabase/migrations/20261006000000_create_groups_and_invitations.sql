CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    avatar_url text,
    privacy text NOT NULL CHECK (privacy IN ('public', 'private', 'invite_only')),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, invitee_id, status)
);

CREATE TABLE public.group_join_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id, status)
);

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_group_invitations_updated_at BEFORE UPDATE ON public.group_invitations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_group_join_requests_updated_at BEFORE UPDATE ON public.group_join_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public and private groups"
ON public.groups FOR SELECT
USING (privacy IN ('public', 'private'));

CREATE POLICY "Users can view groups they are in"
ON public.groups FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can view groups they are invited to"
ON public.groups FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.group_invitations gi
        WHERE gi.group_id = id AND gi.invitee_id = auth.uid()
    )
);

CREATE POLICY "Owner and mods can update group details"
ON public.groups FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = conversation_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'moderator')
    )
);

-- group_invitations
CREATE POLICY "Mods can invite users"
ON public.group_invitations FOR INSERT
WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id
        WHERE g.id = group_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'moderator')
    )
);

CREATE POLICY "Users can see their own invites"
ON public.group_invitations FOR SELECT
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

CREATE POLICY "Mods can see invites for their groups"
ON public.group_invitations FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id
        WHERE g.id = group_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'moderator')
    )
);

-- group_join_requests
CREATE POLICY "Users can request to join private groups"
ON public.group_join_requests FOR INSERT
WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.privacy = 'private')
);

CREATE POLICY "Users can view their own join requests"
ON public.group_join_requests FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Mods can view join requests"
ON public.group_join_requests FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id
        WHERE g.id = group_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'moderator')
    )
);

-- Security Definer RPCs

CREATE OR REPLACE FUNCTION public.create_group_conversation(
    group_name text,
    group_desc text,
    group_privacy text,
    group_avatar text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    new_conv_id uuid;
    new_group_id uuid;
    my_id uuid := auth.uid();
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF group_privacy NOT IN ('public', 'private', 'invite_only') THEN RAISE EXCEPTION 'Invalid privacy type'; END IF;
    IF trim(group_name) = '' THEN RAISE EXCEPTION 'Group name cannot be empty'; END IF;

    INSERT INTO public.conversations (type, created_by) VALUES ('group', my_id) RETURNING id INTO new_conv_id;
    INSERT INTO public.groups (conversation_id, name, description, avatar_url, privacy, created_by)
    VALUES (new_conv_id, trim(group_name), group_desc, group_avatar, group_privacy, my_id)
    RETURNING id INTO new_group_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (new_conv_id, my_id, 'owner');
    RETURN new_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.join_public_group(target_group_id uuid) RETURNS void AS $$
DECLARE
    conv_id uuid;
    priv text;
    my_id uuid := auth.uid();
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT conversation_id, privacy INTO conv_id, priv FROM public.groups WHERE id = target_group_id;
    IF conv_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
    IF priv != 'public' THEN RAISE EXCEPTION 'Group is not public'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id) THEN
        INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (conv_id, my_id, 'member');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
    
    INSERT INTO public.notifications (user_id, type, reference_id) VALUES (req_user_id, 'join_request_approved', target_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reject_join_request(target_request_id uuid) RETURNS void AS $$
DECLARE
    req_group_id uuid;
    req_status text;
    my_id uuid := auth.uid();
    my_role text;
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT group_id, status INTO req_group_id, req_status FROM public.group_join_requests WHERE id = target_request_id;
    IF req_group_id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
    IF req_status != 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;

    SELECT cm.role INTO my_role FROM public.groups g
    LEFT JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id AND cm.user_id = my_id
    WHERE g.id = req_group_id;

    IF my_role NOT IN ('owner', 'moderator') THEN RAISE EXCEPTION 'Not authorized'; END IF;
    UPDATE public.group_join_requests SET status = 'rejected', updated_at = now() WHERE id = target_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.accept_group_invite(target_invite_id uuid) RETURNS void AS $$
DECLARE
    inv_group_id uuid;
    inv_invitee_id uuid;
    inv_status text;
    conv_id uuid;
    my_id uuid := auth.uid();
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT group_id, invitee_id, status INTO inv_group_id, inv_invitee_id, inv_status FROM public.group_invitations WHERE id = target_invite_id;
    IF inv_group_id IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;
    IF inv_invitee_id != my_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF inv_status != 'pending' THEN RAISE EXCEPTION 'Invite not pending'; END IF;

    SELECT conversation_id INTO conv_id FROM public.groups WHERE id = inv_group_id;
    UPDATE public.group_invitations SET status = 'accepted', updated_at = now() WHERE id = target_invite_id;

    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id) THEN
        INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (conv_id, my_id, 'member');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decline_group_invite(target_invite_id uuid) RETURNS void AS $$
DECLARE
    my_id uuid := auth.uid();
BEGIN
    UPDATE public.group_invitations SET status = 'declined', updated_at = now() WHERE id = target_invite_id AND invitee_id = my_id AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_member_role(target_group_id uuid, target_user_id uuid, new_role text)
RETURNS void AS $$
DECLARE
    conv_id uuid;
    my_id uuid := auth.uid();
    my_role text;
    target_current_role text;
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF new_role NOT IN ('owner', 'moderator', 'member') THEN RAISE EXCEPTION 'Invalid role'; END IF;
    IF my_id = target_user_id THEN RAISE EXCEPTION 'Cannot change own role'; END IF;

    SELECT conversation_id INTO conv_id FROM public.groups WHERE id = target_group_id;
    IF conv_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;

    SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id;
    IF my_role != 'owner' THEN RAISE EXCEPTION 'Only owners can change roles'; END IF;

    SELECT role INTO target_current_role FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = target_user_id;
    IF target_current_role IS NULL THEN RAISE EXCEPTION 'User not in group'; END IF;
    IF target_current_role = 'owner' THEN RAISE EXCEPTION 'Cannot demote owner'; END IF;

    UPDATE public.conversation_members SET role = new_role WHERE conversation_id = conv_id AND user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.remove_member(target_group_id uuid, target_user_id uuid)
RETURNS void AS $$
DECLARE
    conv_id uuid;
    my_id uuid := auth.uid();
    my_role text;
    target_current_role text;
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF my_id = target_user_id THEN RAISE EXCEPTION 'Use leave_group instead'; END IF;

    SELECT conversation_id INTO conv_id FROM public.groups WHERE id = target_group_id;
    IF conv_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;

    SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id;
    IF my_role NOT IN ('owner', 'moderator') THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT role INTO target_current_role FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = target_user_id;
    IF target_current_role IS NULL THEN RAISE EXCEPTION 'User not in group'; END IF;
    IF target_current_role = 'owner' THEN RAISE EXCEPTION 'Cannot remove owner'; END IF;
    IF my_role = 'moderator' AND target_current_role = 'moderator' THEN RAISE EXCEPTION 'Moderators cannot remove other moderators'; END IF;

    DELETE FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.leave_group(target_group_id uuid)
RETURNS void AS $$
DECLARE
    conv_id uuid;
    my_id uuid := auth.uid();
    my_role text;
    member_count int;
BEGIN
    IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT conversation_id INTO conv_id FROM public.groups WHERE id = target_group_id;
    IF conv_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;

    SELECT role INTO my_role FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id;
    IF my_role IS NULL THEN RAISE EXCEPTION 'Not in group'; END IF;

    IF my_role = 'owner' THEN
        SELECT COUNT(*) INTO member_count FROM public.conversation_members WHERE conversation_id = conv_id;
        IF member_count > 1 THEN
            RAISE EXCEPTION 'Owner must transfer ownership before leaving or delete the group';
        ELSE
            DELETE FROM public.conversations WHERE id = conv_id;
            RETURN;
        END IF;
    END IF;

    DELETE FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = my_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.invite_user_to_group(target_group_id uuid, target_user_id uuid)
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
    IF my_role NOT IN ('owner', 'moderator') THEN RAISE EXCEPTION 'Only owner or moderator can invite'; END IF;

    IF EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = conv_id AND user_id = target_user_id) THEN
        RAISE EXCEPTION 'User already in group';
    END IF;

    INSERT INTO public.group_invitations (group_id, inviter_id, invitee_id, status)
    VALUES (target_group_id, my_id, target_user_id, 'pending')
    ON CONFLICT (group_id, invitee_id, status) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
