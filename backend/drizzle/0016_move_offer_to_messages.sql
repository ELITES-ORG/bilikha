DO $$
BEGIN
  -- conversations.offer_id moves onto the earliest client message in each
  -- conversation, then both offer_id and subject are dropped. Lives in SQL
  -- (same pattern as 0013) so db:migrate cannot apply the drop without the
  -- move having succeeded in the same transaction.
  --
  -- Conditional: a database that never had conversations.offer_id (or already
  -- dropped it) is a no-op.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'offer_id'
  ) THEN
    RETURN;
  END IF;

  -- Set offer_id on the earliest message from the client. Never rewrite a
  -- message that already carries an offer_id (rule 3).
  UPDATE messages m
  SET offer_id = c.offer_id
  FROM conversations c
  WHERE m.id = (
    SELECT m2.id
    FROM messages m2
    WHERE m2.conversation_id = c.id
      AND m2.sender_user_id = c.client_user_id
    ORDER BY m2.created_at ASC, m2.id ASC
    LIMIT 1
  )
  AND c.offer_id IS NOT NULL
  AND m.offer_id IS NULL;

  -- Refuse to drop while any conversation still has an offer_id that is not
  -- on at least one of its messages. Aborting the migration fails the deploy,
  -- which is the safe direction.
  IF EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.offer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.offer_id = c.offer_id
      )
  ) THEN
    RAISE EXCEPTION 'conversations.offer_id would be lost - aborting the drop';
  END IF;

  ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_offer_id_offers_id_fk;
  DROP INDEX IF EXISTS conversations_offer_idx;
  ALTER TABLE conversations DROP COLUMN offer_id;
  ALTER TABLE conversations DROP COLUMN subject;
END $$;
