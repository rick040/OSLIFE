-- Strategie HQ · Klantanalyse & Persona's — a third, opt-in pipeline on
-- business_ideas, alongside elaboration (idea-elaborate) and the MVP Launch
-- Plan (idea-mvp-plan). Where elaboration answers "is this idea any good on
-- paper" and the MVP plan answers "how do I validate it cheaply", this
-- answers "who exactly am I building this for" — buyer persona's, a
-- competitor scan, a positioning statement and a pricing suggestion. Rick
-- triggers this explicitly per idea, not automatically. Same shape as the
-- mvp_plan columns (20260727100000_business_ideas_mvp_plan.sql): nullable,
-- no default, because most ideas never ask for one.

alter table business_ideas
  add column if not exists customer_analysis_status text check (customer_analysis_status is null or customer_analysis_status in ('pending','processing','ready','failed')),
  add column if not exists customer_analysis_error  text,
  add column if not exists customer_analysis        jsonb; -- {targetMarket, marketInsight, personas:[{name,role,ageRange,situation,goals:[],painPoints:[],triggers:[],objections:[],whereToFind:[],quote}], competitors:[{name,description,strength,weakness}], positioning, pricingSuggestion}
