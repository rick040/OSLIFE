-- Strategie HQ · MVP Launch Plan — a second, opt-in pipeline on business_ideas.
-- Where idea-elaborate answers "is this idea any good on paper", the MVP plan
-- answers "how do I find out if anyone wants this before I build it" — a
-- lean-startup style validation plan (cheapest possible experiments, a
-- phased roadmap, signals to watch for) that Rick triggers explicitly per
-- idea, not automatically. Nullable/no-default columns (unlike
-- elaboration_status) because most ideas never ask for one.

alter table business_ideas
  add column if not exists mvp_plan_status text check (mvp_plan_status is null or mvp_plan_status in ('pending','processing','ready','failed')),
  add column if not exists mvp_plan_error  text,
  add column if not exists mvp_plan        jsonb; -- {hypothesis, riskiestAssumption, targetCustomer, channels:[{name,why,effort,cost}], experiments:[{title,description,channel,effort,cost,timeframe,successSignal}], roadmap:[{phase,goal,tasks:[{title,done}]}], signalsToWatch:[], emailCaveat}
