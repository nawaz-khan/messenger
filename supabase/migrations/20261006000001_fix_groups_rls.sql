-- Fix infinite recursion in RLS policies

-- 1. Fix groups policy ambiguity
DROP POLICY IF EXISTS "Users can view groups they are in" ON public.groups;
CREATE POLICY "Users can view groups they are in"
ON public.groups FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = groups.conversation_id AND cm.user_id = auth.uid()
    )
);

-- 2. Helper to break RLS cycle
CREATE OR REPLACE FUNCTION public.is_group_moderator(target_group_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id
        WHERE g.id = target_group_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'moderator')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Fix group_invitations policies
DROP POLICY IF EXISTS "Mods can invite users" ON public.group_invitations;
CREATE POLICY "Mods can invite users"
ON public.group_invitations FOR INSERT
WITH CHECK (
    auth.uid() = inviter_id AND
    public.is_group_moderator(group_id)
);

DROP POLICY IF EXISTS "Mods can see invites for their groups" ON public.group_invitations;
CREATE POLICY "Mods can see invites for their groups"
ON public.group_invitations FOR SELECT
USING (
    public.is_group_moderator(group_id)
);

-- 4. Fix group_join_requests policies
DROP POLICY IF EXISTS "Mods can view join requests" ON public.group_join_requests;
CREATE POLICY "Mods can view join requests"
ON public.group_join_requests FOR SELECT
USING (
    public.is_group_moderator(group_id)
);

-- 5. Fix create_group_conversation to return conversation_id instead of group_id
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
    RETURN new_conv_id; -- FIXED: Return conversation_id so redirect works
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
