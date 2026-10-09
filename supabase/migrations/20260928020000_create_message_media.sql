-- Add has_media to messages and relax content constraint
ALTER TABLE public.messages ADD COLUMN has_media boolean NOT NULL DEFAULT false;

ALTER TABLE public.messages DROP CONSTRAINT messages_content_check;

ALTER TABLE public.messages ADD CONSTRAINT messages_content_check CHECK (
    (deleted_at IS NOT NULL) OR (content IS NOT NULL AND trim(content) != '') OR (has_media = true)
);

-- Create message_media table
CREATE TABLE public.message_media (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    uploader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    drive_file_id text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('IMAGE', 'GIF', 'VIDEO')),
    mime_type text NOT NULL,
    original_filename text NOT NULL,
    file_size bigint NOT NULL,
    preview_drive_file_id text,
    status text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADING', 'UPLOADED', 'FAILED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT message_media_pkey PRIMARY KEY (id)
);

ALTER TABLE public.message_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read media in their conversations"
ON public.message_media FOR SELECT
USING (public.is_member_of(conversation_id));

CREATE POLICY "Users can insert media in their conversations"
ON public.message_media FOR INSERT
WITH CHECK (
    uploader_id = auth.uid() AND
    public.is_member_of(conversation_id)
);

-- Enable Realtime for message_media
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_media;
