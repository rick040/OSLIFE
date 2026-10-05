-- OSLIFE · keep projects.progress in sync with the project's tasks + milestones.
--
-- Until now the percentage was only computed on screen (ProjectDetail) and never
-- written back, so projects.progress stayed at its default 0. Everything that
-- reads the stored column — the Projecten list sort, the "Actieve projecten"
-- Android widget (widget-projects) — showed 0% even for finished projects.
--
-- Same formula as ProjectDetail: every task counts as 1 (done) or 0, every
-- milestone counts as its own 0..1 progress, averaged over tasks + milestones.
-- A project with neither keeps whatever progress it has (manual value).

create or replace function public.recompute_project_progress(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_sum   numeric;
  v_new   numeric(5,4);
begin
  select
    (select count(*) from project_tasks      where project_id = p_id)
  + (select count(*) from project_milestones where project_id = p_id),
    (select count(*) from project_tasks      where project_id = p_id and done)
  + (select coalesce(sum(progress), 0) from project_milestones where project_id = p_id)
  into v_count, v_sum;

  if v_count = 0 then return; end if;

  v_new := round(least(1, greatest(0, v_sum / v_count)), 4);

  -- Only write when it changed: avoids a realtime event per no-op toggle.
  update projects set progress = v_new
   where id = p_id and progress is distinct from v_new;
end;
$$;

create or replace function public.trg_project_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recompute_project_progress(new.project_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.project_id is distinct from new.project_id) then
    perform public.recompute_project_progress(old.project_id);
  end if;
  return null;
end;
$$;

drop trigger if exists project_tasks_progress on project_tasks;
create trigger project_tasks_progress
  after insert or delete or update of done, project_id on project_tasks
  for each row execute function public.trg_project_progress();

drop trigger if exists project_milestones_progress on project_milestones;
create trigger project_milestones_progress
  after insert or delete or update of done, progress, project_id on project_milestones
  for each row execute function public.trg_project_progress();

-- Backfill: bring every existing project in line right away.
select public.recompute_project_progress(p.id)
  from projects p
 where exists (select 1 from project_tasks t where t.project_id = p.id)
    or exists (select 1 from project_milestones m where m.project_id = p.id);
