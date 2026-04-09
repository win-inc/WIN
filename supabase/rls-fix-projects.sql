drop policy if exists "projects_select_for_members" on public.projects;

create policy "projects_select_for_members"
on public.projects
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
  )
);
