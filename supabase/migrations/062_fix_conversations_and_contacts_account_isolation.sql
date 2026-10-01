-- Migration 062: Fix contacts, conversations, and messages account_id association & RLS
-- Allows users to access their own domain data whether partitioned by account_id or user_id

-- 1. Re-align contacts and conversations where account_id was mistakenly set to owner_user_id
UPDATE public.contacts c
SET account_id = a.id
FROM public.accounts a
WHERE c.account_id = a.owner_user_id
  AND a.id <> a.owner_user_id;

UPDATE public.conversations c
SET account_id = a.id
FROM public.accounts a
WHERE c.account_id = a.owner_user_id
  AND a.id <> a.owner_user_id;

UPDATE public.profiles p
SET account_id = a.id
FROM public.accounts a
WHERE p.account_id = a.owner_user_id
  AND a.id <> a.owner_user_id;

-- 2. Allow authenticated users to view conversations if they are an account member OR if auth.uid() = user_id
DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT
  USING (is_account_member(account_id) OR auth.uid() = user_id);

-- 3. Allow authenticated users to view contacts if they are an account member OR if auth.uid() = user_id
DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select ON public.contacts FOR SELECT
  USING (is_account_member(account_id) OR auth.uid() = user_id);

-- 4. Allow authenticated users to view messages if the conversation is accessible to them
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (is_account_member(c.account_id) OR auth.uid() = c.user_id)
    )
  );
