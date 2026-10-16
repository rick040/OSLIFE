-- Workout remote mode, part 2: start a workout from the phone.
--
-- The gym screen has no input, so the phone picks the plan and writes a start
-- request into the same workout_live row: status 'requested' + plan_id. The
-- screen (idle on /tablet/workout) sees the request over Realtime, opens that
-- plan's workout and publishes the real state, which flips the row to 'active'.
alter table workout_live drop constraint if exists workout_live_status_check;
alter table workout_live add constraint workout_live_status_check
  check (status in ('active', 'ended', 'requested'));
