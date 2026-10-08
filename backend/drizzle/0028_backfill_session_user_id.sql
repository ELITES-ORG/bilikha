-- Sessions signed in before 0027 carry their user only inside the serialised
-- `data`, so `user_id` is null on every one of them. An administrator's reset
-- revokes sessions by `user_id` (ADR 0051): without this, a session signed in
-- before the deploy would survive a reset, sit locked while the flag is set,
-- and get its access back the moment the owner chose a new password.
--
-- The id is read with a pattern, not a `::jsonb` cast, so a malformed row can
-- never fail the deploy. Joining `users` keeps a session whose account has gone
-- from violating the foreign key; those sessions are dead anyway.
UPDATE "sessions" AS s
SET "user_id" = u."id"
FROM "users" AS u
WHERE s."user_id" IS NULL
  AND u."id"::text = substring(s."data" from '"userId":"([0-9a-f-]{36})"');
