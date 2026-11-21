-- 0008_push.sql
-- Push notifications (SPEC 15, T27; wiki #202-207):
--   · notifications gains actor_id (who caused it) and pushed_at (sent, or decided not to send).
--   · Triggers for every event of reglas-finales › Notificaciones except the 24 h reminder (T28). Nobody is
--     notified of what they did themselves.
--   · Urgent questions reach the neighbors of the same city and zone with the notice on, at most 3 per hour each.
--   · Every new notification calls /api/push through pg_net. The URL and the secret live in Supabase Vault
--     (push_url, push_secret); without them nothing is sent and the row is still saved.
--   · save_push_subscription / delete_push_subscription: the device's subscription belongs to whoever is signed in.

create extension if not exists pg_net;

alter table public.notifications add column actor_id bigint references public.profiles (id);
alter table public.notifications add column pushed_at timestamptz;
create index notifications_kind_ref_pushed_idx on public.notifications (kind, ref_id, pushed_at);
create index notifications_user_kind_created_idx on public.notifications (user_id, kind, created_at);

-- One notification, unless it would go to the person who caused it.
create or replace function public.notify(p_user bigint, p_kind text, p_ref_kind text, p_ref_id bigint, p_actor bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, ref_kind, ref_id, actor_id)
  select p_user, p_kind, p_ref_kind, p_ref_id, p_actor
  where p_user is not null and p_user is distinct from p_actor;
$$;

-- ---------------------------------------------------------------------------
-- The two triggers of 0003, now with actor_id
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_new_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify(q.author_id, 'answer', 'question', q.id, new.author_id)
  from public.questions q where q.id = new.question_id;
  return new;
end;
$$;

create or replace function public.notify_on_helpful_mark()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.helpful then
    perform public.notify(a.author_id, 'helpful', 'answer', a.id, new.rater_id)
    from public.answers a where a.id = new.answer_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A comment: the answer's author, the question's author and everyone who already commented in that thread
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify(people.id, 'comment', 'comment', new.id, new.author_id)
  from (
    select a.author_id as id from public.answers a where a.id = new.answer_id
    union
    select q.author_id from public.answers a join public.questions q on q.id = a.question_id where a.id = new.answer_id
    union
    select c.author_id from public.answer_comments c where c.answer_id = new.answer_id and c.id <> new.id
  ) people;
  return new;
end;
$$;

create trigger answer_comments_notify
  after insert on public.answer_comments
  for each row execute function public.notify_on_comment();

-- ---------------------------------------------------------------------------
-- «Me sirvió» on a letrero (the push is limited to one per hour per letrero in /api/push)
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_sign_helpful()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.helpful and (tg_op = 'INSERT' or not old.helpful) then
    perform public.notify(s.author_id, 'sign_helpful', 'sign', s.id, new.voter_id)
    from public.signs s where s.id = new.sign_id;
  end if;
  return new;
end;
$$;

create trigger sign_votes_notify
  after insert or update of helpful on public.sign_votes
  for each row execute function public.notify_on_sign_helpful();

-- ---------------------------------------------------------------------------
-- «Pedir contacto»: the request goes to who answered; an acceptance goes back to who asked. «Ahora no» is silent.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.owner_id, 'contact_request', 'contact_request', new.id, new.requester_id);
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.notify(new.requester_id, 'contact_accepted', 'contact_request', new.id, new.owner_id);
  end if;
  return new;
end;
$$;

create trigger contact_requests_notify
  after insert or update of status on public.contact_requests
  for each row execute function public.notify_on_contact();

-- ---------------------------------------------------------------------------
-- An urgent question: neighbors of the same city and zone, with the notice on, below 3 urgent in the last hour
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_urgent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.urgent_until is null or new.urgent_until <= now() then return new; end if;
  if tg_op = 'UPDATE' and old.urgent_until is not null and old.urgent_until > now() then return new; end if;

  perform public.notify(p.id, 'urgent', 'question', new.id, new.author_id)
  from public.profiles p
  where p.city = new.city
    and p.zone_norm = new.zone_norm
    and p.zone_norm <> ''
    and p.id <> new.author_id
    and (p.notif_prefs -> 'urgent') is distinct from 'false'::jsonb
    and (select count(*) from public.notifications n
         where n.user_id = p.id and n.kind = 'urgent' and n.created_at > now() - interval '1 hour') < 3;
  return new;
end;
$$;

create trigger questions_notify_urgent
  after insert or update of urgent_until on public.questions
  for each row execute function public.notify_on_urgent();

-- ---------------------------------------------------------------------------
-- Every new notification asks /api/push to send it. pg_net sends after the commit, so the row is visible there.
-- A failure here never blocks the action that caused the notification.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_push()
returns trigger
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
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push();

-- ---------------------------------------------------------------------------
-- The device's subscription: an endpoint belongs to whoever signed in last on that phone (#207)
-- ---------------------------------------------------------------------------
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me bigint := public.current_profile_id();
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid subscription' using errcode = '23514';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (me, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me bigint := public.current_profile_id();
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = me;
end;
$$;

-- ---------------------------------------------------------------------------
-- What /api/push needs to write one push (service role only): who receives it, their preferences, who caused it,
-- the text to quote, where a tap opens, whether the item is still there for them (not deleted, not hidden by them,
-- not in review) and whether this letrero already pushed a «Me sirvió» in the last hour.
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
  elsif n.kind = 'urgent' then
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
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.notify(bigint, text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.notify_on_comment(), public.notify_on_sign_helpful(), public.notify_on_contact(),
  public.notify_on_urgent(), public.dispatch_push() from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) to authenticated;
revoke all on function public.push_details(bigint) from public, anon, authenticated;
grant execute on function public.push_details(bigint) to service_role;
