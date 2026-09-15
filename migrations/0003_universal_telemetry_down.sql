-- 0003_universal_telemetry_down.sql
-- Rollback for 0003_universal_telemetry.sql – remove telemetry registry tables and drop added columns

-- Remove columns added to enforcement_events by 0003
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS model_id;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS model_version;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS component_version;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS action;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS observation;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS decision;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS outcome;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS metadata;
ALTER TABLE enforcement_events DROP COLUMN IF EXISTS redaction_status;

-- Drop telemetry registry tables
DROP TABLE IF EXISTS telemetry_interventions;
DROP TABLE IF EXISTS telemetry_event_schemas;
DROP TABLE IF EXISTS telemetry_attributes;
DROP TABLE IF EXISTS telemetry_components;
