-- Create blocked_users table
CREATE TABLE IF NOT EXISTS public.blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(blocker_id, blocked_id)
);

-- RLS for blocked_users
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocks they are involved in"
    ON public.blocked_users FOR SELECT
    USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "Users can block others"
    ON public.blocked_users FOR INSERT
    WITH CHECK (auth.uid() = blocker_id AND blocker_id != blocked_id);

CREATE POLICY "Users can unblock others"
    ON public.blocked_users FOR DELETE
    USING (auth.uid() = blocker_id);

-- Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports"
    ON public.reports FOR SELECT
    USING (auth.uid() = reporter_id);

CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id AND reporter_id != reported_id);

-- Add helper RPC for blocking to make sure we don't block ourselves
CREATE OR REPLACE FUNCTION public.block_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    IF auth.uid() = target_user_id THEN
        RAISE EXCEPTION 'Cannot block yourself';
    END IF;

    INSERT INTO public.blocked_users (blocker_id, blocked_id)
    VALUES (auth.uid(), target_user_id)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END;
$$;

-- Add helper RPC for unblocking
CREATE OR REPLACE FUNCTION public.unblock_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM public.blocked_users
    WHERE blocker_id = auth.uid() AND blocked_id = target_user_id;
END;
$$;

-- Add helper RPC for reporting
CREATE OR REPLACE FUNCTION public.report_user(
    target_user_id UUID, 
    report_reason TEXT, 
    report_description TEXT DEFAULT NULL,
    target_message_id UUID DEFAULT NULL,
    target_conversation_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF auth.uid() = target_user_id THEN
        RAISE EXCEPTION 'Cannot report yourself';
    END IF;

    INSERT INTO public.reports (
        reporter_id, 
        reported_id, 
        reason, 
        description, 
        message_id, 
        conversation_id
    )
    VALUES (
        auth.uid(), 
        target_user_id, 
        report_reason, 
        report_description, 
        target_message_id, 
        target_conversation_id
    );
END;
$$;
