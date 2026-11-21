-- 0009_reminders.sql
-- 24 h reminder «¿Alguna respuesta te sirvió?» and the resend of lost pushes (SPEC 18, T28; wiki #44, #112, #208):
--   · pg_cron runs public.run_hourly_push_jobs() at minute 7 of every hour, all inside the database: no endpoint
--     and no CRON_SECRET.
--   · An open question whose first answer is 24-48 h old gets one 'reminder' notification for its author, only once.
--     The existing notifications_dispatch_push trigger (0008) sends it through /api/push.
--   · Notifications 5-65 minutes old that /api/push never processed (pushed_at null) are requested again.
--     /api/push claims pushed_at before sending, so a resend never pushes twice.

create extension if not exists pg_cron with schema pg_catalog;

-- Only once per question, even if two runs overlap
create unique index notifications_one_reminder_idx on public.notifications (ref_id) where kind = 'reminder';

-- ---------------------------------------------------------------------------
-- The pg_net call of 0008, shared by the trigger and the resend. Without the Vault secrets it does nothing.
-- ---------------------------------------------------------------------------
create or replace function public.request_push(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  return;
end;
$$;

create or replace function public.dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.request_push(new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The reminder: open questions whose first answer (the oldest one still there) is 24-48 h old
-- ---------------------------------------------------------------------------
create or replace function public.queue_answer_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.notifications (user_id, kind, ref_kind, ref_id, actor_id)
  select q.author_id, 'reminder', 'question', q.id, null
  from public.questions q
  where q.status = 'open'
    and (select min(a.created_at) from public.answers a where a.question_id = q.id)
        between now() - interval '48 hours' and now() - interval '24 hours'
    and not exists (select 1 from public.notifications n where n.kind = 'reminder' and n.ref_id = q.id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lost pushes: rows /api/push never processed, old enough that the first call is over
-- ---------------------------------------------------------------------------
create or replace function public.resend_pending_pushes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_count integer := 0;
begin
  for v_id in
    select n.id from public.notifications n
    where n.pushed_at is null
      and n.created_at between now() - interval '65 minutes' and now() - interval '5 minutes'
    order by n.id
  loop
    perform public.request_push(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.run_hourly_push_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reminders integer;
  v_resent integer;
begin
  -- Reminders first: they are brand new, so the resend never counts them
  v_reminders := public.queue_answer_reminders();
  v_resent := public.resend_pending_pushes();
  return jsonb_build_object('reminders', v_reminders, 'resent', v_resent);
end;
$$;

-- ---------------------------------------------------------------------------
-- push_details of 0008, with the 'reminder' branch
-- ---------------------------------------------------------------------------
create or replace function public.push_details(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n public.notifications;
  v_text text;
  v_zone text;
  v_url text;
  v_item bigint;
  v_item_kind text;
  v_visible boolean;
begin
  select * into n from public.notifications where id = p_id;
  if not found then return null; end if;

  if n.kind = 'answer' then
    select a.text, a.id, '/p/' || a.question_id into v_text, v_item, v_url
    from public.answers a where a.question_id = n.ref_id and a.author_id = n.actor_id order by a.id desc limit 1;
    v_item_kind := 'answer';
  elsif n.kind = 'comment' then
    select c.text, c.id, '/p/' || a.question_id into v_text, v_item, v_url
    from public.answer_comments c join public.answers a on a.id = c.answer_id where c.id = n.ref_id;
    v_item_kind := 'comment';
  elsif n.kind = 'helpful' then
    select a.text, a.id, '/p/' || a.question_id into v_text, v_item, v_url from public.answers a where a.id = n.ref_id;
    v_item_kind := 'answer';
  elsif n.kind = 'sign_helpful' then
    select s.title, s.id, '/l/' || s.id into v_text, v_item, v_url from public.signs s where s.id = n.ref_id;
    v_item_kind := 'sign';
  elsif n.kind in ('contact_request', 'contact_accepted') then
    select q.text, q.id, '/p/' || q.id into v_text, v_item, v_url
    from public.contact_requests r
    join public.questions q on q.id = coalesce(r.question_id, (select a.question_id from public.answers a where a.id = r.answer_id))
    where r.id = n.ref_id;
    v_item_kind := 'question';
  elsif n.kind in ('urgent', 'reminder') then
    select q.text, q.zone, q.id, '/p/' || q.id into v_text, v_zone, v_item, v_url from public.questions q where q.id = n.ref_id;
    v_item_kind := 'question';
  end if;

  v_visible := v_item is not null
    and not exists (select 1 from public.hidden_items h where h.user_id = n.user_id and h.kind = v_item_kind and h.target_id = v_item)
    and public.report_count(v_item_kind, v_item) < 3;

  return jsonb_build_object(
    'userId', n.user_id,
    'kind', n.kind,
    'refId', n.ref_id,
    'pushedAt', n.pushed_at,
    'prefs', (select p.notif_prefs from public.profiles p where p.id = n.user_id),
    'actor', (select p.display_name from public.profiles_public p where p.id = n.actor_id),
    'text', v_text,
    'zone', v_zone,
    'url', v_url,
    'visible', v_visible,
    'signPushedRecently', n.kind = 'sign_helpful' and exists (
      select 1 from public.notifications o
      where o.kind = 'sign_helpful' and o.ref_id = n.ref_id and o.id <> n.id and o.pushed_at > now() - interval '1 hour')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the database (the trigger and pg_cron) runs these
-- ---------------------------------------------------------------------------
revoke all on function public.request_push(bigint), public.queue_answer_reminders(), public.resend_pending_pushes(),
  public.run_hourly_push_jobs() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Every hour at minute 7. Scheduling by name again replaces the job.
-- ---------------------------------------------------------------------------
select cron.schedule('bs-hourly-push', '7 * * * *', 'select public.run_hourly_push_jobs()');
