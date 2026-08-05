-- Manual urgency override for payments, so Rick can decide which open
-- payments actually need attention instead of only the due-date heuristic
-- (overdue / due within a few days) financeCoach used to rely on alone.
-- null = no manual override, use the date-based default; true = flagged
-- urgent by Rick; false = flagged "can wait" even if the date looks urgent.
alter table payments
  add column if not exists urgent boolean;
