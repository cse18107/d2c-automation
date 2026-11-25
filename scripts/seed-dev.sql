-- Local dev org that DEV_SESSION_ORG_ID points at. Safe to re-run.
INSERT INTO organizations (id, name, pause_publishing)
VALUES ('0196a0a0-0000-7000-8000-000000000001', 'Dev Brand Co', false)
ON CONFLICT (id) DO NOTHING;
