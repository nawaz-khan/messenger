-- Realtime Presence Authorization
-- Private channels for conversation topics require authorization via realtime.messages RLS
-- Channel topic format: conversation:<conversationId>

-- Enable RLS on realtime.messages (if not already)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow conversation members to subscribe to their conversation's private channel
-- This authorizes the initial channel join for presence
CREATE POLICY "Conversation members can join private channel"
ON realtime.messages FOR SELECT
USING (
    extension = 'presence'
    AND topic LIKE 'conversation:%'
    AND public.is_member_of(
        replace(topic, 'conversation:', '')::uuid
    )
);

-- Policy: Allow conversation members to publish presence (track)
-- INSERT on realtime.messages is used for publishing presence/broadcast
CREATE POLICY "Conversation members can track presence"
ON realtime.messages FOR INSERT
WITH CHECK (
    extension = 'presence'
    AND topic LIKE 'conversation:%'
    AND public.is_member_of(
        replace(topic, 'conversation:', '')::uuid
    )
    AND payload->>'user_id' = auth.uid()::text
);

-- Policy: Allow conversation members to receive presence updates
-- The realtime server delivers presence events via SELECT on realtime.messages
-- This policy is covered by the SELECT policy above

-- Note: The SELECT policy also covers presence state sync events
-- The INSERT policy ensures users can only track their own user_id