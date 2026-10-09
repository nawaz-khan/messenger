-- Create notifications table
CREATE TABLE public.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('new_message')),
    reference_id uuid, -- conversation_id or similar
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_notifications_user_id_read_at ON public.notifications(user_id, read_at);

-- Prefix search index for username
CREATE INDEX idx_profiles_username_search ON public.profiles(username_normalized text_pattern_ops);

-- Notification creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_message_notification()
RETURNS trigger AS $$
DECLARE
    member_record record;
BEGIN
    FOR member_record IN 
        SELECT user_id 
        FROM public.conversation_members 
        WHERE conversation_id = NEW.conversation_id 
        AND user_id != NEW.sender_id
    LOOP
        INSERT INTO public.notifications (user_id, type, reference_id, created_at)
        VALUES (member_record.user_id, 'new_message', NEW.conversation_id, NEW.created_at);
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_new_message_created
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_message_notification();

-- Enable realtime for notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
