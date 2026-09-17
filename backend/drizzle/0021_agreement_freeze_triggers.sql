-- Accepted agreements are immutable (ADR 0029). Service refuses updates; these
-- triggers are the storage-layer backstop for direct SQL and forgotten branches.
CREATE OR REPLACE FUNCTION prevent_accepted_agreement_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'accepted agreements cannot be modified'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agreements_freeze_accepted
  BEFORE UPDATE ON agreements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_accepted_agreement_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_accepted_agreement_line_item_mutation()
RETURNS trigger AS $$
DECLARE
  ag_status agreement_status;
BEGIN
  SELECT status INTO ag_status FROM agreements WHERE id = COALESCE(NEW.agreement_id, OLD.agreement_id);
  IF ag_status = 'accepted' THEN
    RAISE EXCEPTION 'line items of an accepted agreement cannot be modified'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agreement_line_items_freeze_accepted
  BEFORE INSERT OR UPDATE OR DELETE ON agreement_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_accepted_agreement_line_item_mutation();
