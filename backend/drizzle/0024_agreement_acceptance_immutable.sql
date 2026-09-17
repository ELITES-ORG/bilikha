-- An acceptance is written once and never changes (ADR 0029, ADR 0032).
--
-- Found auditing plan 0020: the agreement itself was frozen against every
-- modification and its deletion refused, while the row recording *who* accepted
-- it, *when*, and *against what content* stayed freely editable and deletable.
-- That is the half carrying the evidential weight — the content hash is what
-- proves the document was not edited after the fact, and accepted_by_user_id is
-- what names the person who agreed.
--
-- Without this an accepted agreement could be left standing with no acceptance
-- at all, or with one reassigned to somebody who never accepted it.
--
-- Nothing in the application updates or deletes these rows; the service only
-- inserts and reads them. If a future erasure feature needs the acceptor's
-- identity detached, that is ADR 0032's anonymisation, and it belongs in a
-- decision rather than in a DELETE that gets past this by removing the trigger.
CREATE OR REPLACE FUNCTION prevent_agreement_acceptance_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'an agreement acceptance cannot be changed or removed'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agreement_acceptances_immutable
  BEFORE UPDATE OR DELETE ON agreement_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION prevent_agreement_acceptance_mutation();
