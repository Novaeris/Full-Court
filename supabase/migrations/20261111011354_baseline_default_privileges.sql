-- Baseline: nothing in the public schema is reachable through the Data API
-- until a migration grants it on purpose (docs/ARCHITECTURE.md, "Shared backend").
--
-- Supabase normally grants anon and authenticated full access to every new
-- table, function and sequence in public, leaving RLS as the only guard.
-- Here each new object starts with no client access. A later migration that
-- creates a table must enable RLS, add policies, and grant only what clients
-- need (for example: grant select on public.profiles to authenticated).

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;

-- PostgreSQL also grants EXECUTE on every new function to PUBLIC through a
-- global (not schema-scoped) default, which the statement above cannot remove.
alter default privileges for role postgres
  revoke execute on functions from public;
