create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('web', 'pdf')),
  source_url text,
  asset_path text,
  asset_name text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'client', 'viewer')),
  joined_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.project_annotations (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  mode text not null check (mode in ('web', 'pdf')),
  page integer not null default 1,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  comment text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute procedure public.set_projects_updated_at();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_annotations enable row level security;

create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "projects_select_for_members"
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
  )
);

create policy "projects_insert_for_authenticated"
on public.projects
for insert
to authenticated
with check (created_by = auth.uid());

create policy "projects_update_for_editors"
on public.projects
for update
to authenticated
using (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor', 'client')
  )
)
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor', 'client')
  )
);

create policy "project_members_select_for_members"
on public.project_members
for select
to authenticated
using (
  exists (
    select 1
    from public.project_members viewer
    where viewer.project_id = project_members.project_id
      and viewer.user_id = auth.uid()
  )
);

create policy "project_members_insert_for_managers"
on public.project_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_members manager
    where manager.project_id = project_members.project_id
      and manager.user_id = auth.uid()
      and manager.role in ('owner', 'editor')
  )
  or (
    project_members.user_id = auth.uid()
    and project_members.role = 'owner'
  )
);

create policy "project_members_update_for_managers"
on public.project_members
for update
to authenticated
using (
  exists (
    select 1
    from public.project_members manager
    where manager.project_id = project_members.project_id
      and manager.user_id = auth.uid()
      and manager.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.project_members manager
    where manager.project_id = project_members.project_id
      and manager.user_id = auth.uid()
      and manager.role in ('owner', 'editor')
  )
);

create policy "project_annotations_select_for_members"
on public.project_annotations
for select
to authenticated
using (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_annotations.project_id
      and pm.user_id = auth.uid()
  )
);

create policy "project_annotations_insert_for_editors"
on public.project_annotations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_annotations.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor', 'client')
  )
);

create policy "project_annotations_delete_for_editors"
on public.project_annotations
for delete
to authenticated
using (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_annotations.project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor', 'client')
  )
);

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

create policy "storage_select_for_project_members"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-files'
  and exists (
    select 1
    from public.projects p
    join public.project_members pm on pm.project_id = p.id
    where p.asset_path = storage.objects.name
      and pm.user_id = auth.uid()
  )
);

create policy "storage_insert_for_authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-files'
  and auth.uid() is not null
);
