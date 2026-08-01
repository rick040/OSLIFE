-- Strategie HQ · CRM-koppeling — zodra een idee de status 'active' krijgt kan
-- Rick het in één klik omzetten naar een echt project (createProjectWithTemplate,
-- mijlpalen worden projecttaken). linked_project_id onthoudt die koppeling zodat
-- de UI "Bekijk project" kan tonen in plaats van de omzet-knop opnieuw.
-- on delete set null: het project verwijderen mag nooit de idee-rij breken.

alter table business_ideas
  add column if not exists linked_project_id uuid references projects(id) on delete set null;
