-- 0004_auth_method.sql
-- Which sign-in method an e-mail has (SPEC 07, T15). The sign-in sheet needs it to say
-- «Esta cuenta entra con Google» (wiki #73) and «Contraseña incorrecta» without guessing.
--   'password' → the e-mail has an e-mail + password identity (also when it has Google too)
--   'google'   → only a Google identity
--   null       → not registered
-- Callable by anon on purpose. It tells whether an e-mail is registered; accepted for the demo.
-- Supabase rate limits still apply to the sign-in itself, not to this function.
create or replace function public.auth_method(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when bool_or(i.provider = 'email') then 'password'
    when bool_or(i.provider = 'google') then 'google'
    else null
  end
  from auth.users u
  join auth.identities i on i.user_id = u.id
  where lower(u.email) = lower(btrim(p_email))
$$;

revoke all on function public.auth_method(text) from public;
grant execute on function public.auth_method(text) to anon, authenticated;
