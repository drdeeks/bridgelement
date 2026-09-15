-- 0002_rl_events_down.sql
-- Rollback for 0002_rl_events.sql – drop enforcement_events and associated indexes
DROP INDEX IF EXISTS idx_events_ws_ts;
DROP INDEX IF EXISTS idx_events_ws_type;
DROP INDEX IF EXISTS idx_events_user_ts;
DROP TABLE IF EXISTS enforcement_events;
