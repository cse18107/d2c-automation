-- AI calls are append-only (spec §7, §8): every paid call is a cost record.
-- Reject UPDATE, DELETE and TRUNCATE, the same as audit_events.
CREATE OR REPLACE FUNCTION ai_calls_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_calls is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER ai_calls_no_update_delete
  BEFORE UPDATE OR DELETE ON ai_calls
  FOR EACH STATEMENT EXECUTE FUNCTION ai_calls_reject_mutation();

CREATE TRIGGER ai_calls_no_truncate
  BEFORE TRUNCATE ON ai_calls
  FOR EACH STATEMENT EXECUTE FUNCTION ai_calls_reject_mutation();
