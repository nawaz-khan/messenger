BEGIN;

-- Enable real-time for messages and conversations
-- We drop the tables from publication first (if they exist) to ensure the migration is idempotent
-- Wait, dropping tables that are not in the publication causes an error. 
-- Instead, we can use a PL/pgSQL block to safely add them if they are not already in it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

COMMIT;
