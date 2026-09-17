-- Accepted agreements are not deleted (ADR 0032). The freeze triggers already
-- refuse every modification; this closes the gap a DELETE had. Only `accepted`
-- is protected — a draft is nobody's evidence. Removing this trigger to get past
-- a refusal while building account deletion would destroy the counterparty's
-- record of what was agreed.
CREATE OR REPLACE FUNCTION prevent_accepted_agreement_deletion()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'accepted agreements cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agreements_refuse_accepted_delete
  BEFORE DELETE ON agreements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_accepted_agreement_deletion();
