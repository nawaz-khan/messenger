-- Fix groups policy ambiguity
DROP POLICY IF EXISTS "Users can view groups they are in" ON public.groups;
CREATE POLICY "Users can view groups they are in"
ON public.groups FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = groups.conversation_id AND cm.user_id = auth.uid()
    )
);

-- Helper to break RLS cycle
CREATE OR REPLACE FUNCTION public.is_group_moderator(target_group_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.conversation_members cm ON g.conversation_id = cm.conversation_id
        WHERE g.id = target_group_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'moderator')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix group_invitations policies
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

-- Fix group_join_requests policies
DROP POLICY IF EXISTS "Mods can view join requests" ON public.group_join_requests;
CREATE POLICY "Mods can view join requests"
ON public.group_join_requests FOR SELECT
USING (
    public.is_group_moderator(group_id)
);
