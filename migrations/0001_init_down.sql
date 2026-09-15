-- 0001_init_down.sql
-- Rollback for 0001_init.sql – drop tables in reverse order respecting dependencies
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS watchdog_state;
DROP TABLE IF EXISTS acknowledgments;
DROP TABLE IF EXISTS holds;
DROP TABLE IF EXISTS tool_decisions;
DROP TABLE IF EXISTS agent_profile_bindings;
DROP TABLE IF EXISTS character_profiles;
DROP TABLE IF EXISTS enforcement_policies;
DROP TABLE IF EXISTS habits;
DROP TABLE IF EXISTS installations;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS consents;
