-- LOAD_MOVEMENT_PLAN.md Step 1 (status bridge) — decision D3 (user-approved 2026-06-07).
--
-- RunAssignment.status becomes the per-assignment EXECUTION state (loadVocab
-- EXECUTION_STATES: not_started | en_route_pickup | at_pickup | loaded |
-- en_route_dropoff | at_dropoff | delivered | exception), advanced by driver
-- events via applyJobEvent.
--
-- Before Step 1 the column defaulted to 'pending' and was NEVER read or written
-- beyond that default (confirmed by grep), so changing the default and
-- backfilling existing rows is zero-risk — no live behaviour depends on the old
-- value. Backfill maps the inert 'pending' rows onto the new pre-execution state
-- so existing planned work can be started by drivers after Step 1.

ALTER TABLE "RunAssignment" ALTER COLUMN "status" SET DEFAULT 'not_started';

UPDATE "RunAssignment" SET "status" = 'not_started' WHERE "status" = 'pending';
