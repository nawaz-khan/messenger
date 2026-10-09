-- Add check to prevent duplicate pending reports
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

    -- Prevent duplicate pending reports
    IF target_message_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.reports
            WHERE reporter_id = auth.uid() 
              AND reported_id = target_user_id 
              AND message_id = target_message_id
              AND status = 'pending'
        ) THEN
            RAISE EXCEPTION 'You have already reported this message. It is pending review.';
        END IF;
    ELSE
        IF EXISTS (
            SELECT 1 FROM public.reports
            WHERE reporter_id = auth.uid() 
              AND reported_id = target_user_id 
              AND message_id IS NULL
              AND status = 'pending'
        ) THEN
            RAISE EXCEPTION 'You have already reported this user. It is pending review.';
        END IF;
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
