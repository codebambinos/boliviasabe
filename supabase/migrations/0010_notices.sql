-- 0010_notices.sql — Avisos: the caller's notices already built, the unread count and marking read (SPEC 22, wiki #214).
-- Only adds functions and the Realtime publication: the triggers, push_details and /api/push stay as they are.

-- ---------------------------------------------------------------------------
-- What one row points to, for the caller: text, zone, what it opens and whether it still exists for them.
-- Same rules per kind as push_details (0009); visibility is item_visible (hidden by me, or in review unless mine).
-- ---------------------------------------------------------------------------
create or replace function public.notice_item(n public.notifications)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_text text;
  v_zone text;
  v_open_kind text;
  v_open_id bigint;
  v_item_kind text;
  v_item bigint;
  v_author bigint;
begin
  if n.kind = 'answer' then
    select a.text, a.question_id, a.id, a.author_id into v_text, v_open_id, v_item, v_author
    from public.answers a where a.question_id = n.ref_id and a.author_id = n.actor_id order by a.id desc limit 1;
    v_item_kind := 'answer';
    v_open_kind := 'question';
  elsif n.kind = 'comment' then
    select c.text, a.question_id, c.id, c.author_id into v_text, v_open_id, v_item, v_author
    from public.answer_comments c join public.answers a on a.id = c.answer_id where c.id = n.ref_id;
    v_item_kind := 'comment';
    v_open_kind := 'question';
  elsif n.kind = 'helpful' then
    select a.text, a.question_id, a.id, a.author_id into v_text, v_open_id, v_item, v_author
    from public.answers a where a.id = n.ref_id;
    v_item_kind := 'answer';
    v_open_kind := 'question';
  elsif n.kind = 'sign_helpful' then
    select s.title, s.id, s.id, s.author_id into v_text, v_open_id, v_item, v_author
    from public.signs s where s.id = n.ref_id;
    v_item_kind := 'sign';
    v_open_kind := 'sign';
  elsif n.kind in ('contact_request', 'contact_accepted') then
    select q.text, q.id, q.id, q.author_id into v_text, v_open_id, v_item, v_author
    from public.contact_requests r
    join public.questions q on q.id = coalesce(r.question_id, (select a.question_id from public.answers a where a.id = r.answer_id))
    where r.id = n.ref_id;
    v_item_kind := 'question';
    v_open_kind := 'question';
  elsif n.kind in ('urgent', 'reminder') then
    select q.text, case when n.kind = 'urgent' then q.zone end, q.id, q.id, q.author_id
    into v_text, v_zone, v_open_id, v_item, v_author
    from public.questions q where q.id = n.ref_id;
    v_item_kind := 'question';
    v_open_kind := 'question';
  end if;

  if v_item is null or not public.item_visible(v_item_kind, v_item, v_author) then
    return jsonb_build_object('text', null, 'zone', null, 'open', null);
  end if;
  return jsonb_build_object(
    'text', v_text,
    'zone', v_zone,
    'open', jsonb_build_object('kind', v_open_kind, 'id', v_open_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The caller's notices, 30 per page, newest first. «Me sirvió» of the same letrero are one notice: the newest row
-- gives its id, date and actor; `read` is false while any row is unread; `count` is how many.
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications(p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  v_items jsonb;
  v_total integer;
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;

  with mine as (
    select n.*,
           case when n.kind = 'sign_helpful' then 'sign:' || n.ref_id else 'n:' || n.id end as grp
    from public.notifications n
    where n.user_id = me
  ),
  groups as (
    select grp,
           (array_agg(id order by created_at desc, id desc))[1] as newest_id,
           max(created_at) as newest_at,
           bool_and(read_at is not null) as all_read,
           count(*)::integer as total
    from mine
    group by grp
  ),
  page as (
    select g.*, count(*) over () as all_groups
    from groups g
    order by g.newest_at desc, g.newest_id desc
    offset v_offset limit 30
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'kind', n.kind,
        'createdAt', public.iso_utc(n.created_at),
        'read', p.all_read,
        'actor', (select pp.display_name from public.profiles_public pp where pp.id = n.actor_id),
        'count', p.total,
        'contact', case
          when n.kind in ('contact_request', 'contact_accepted')
            then public.contact_json((select r.answer_id from public.contact_requests r where r.id = n.ref_id))
        end
      ) || public.notice_item(n)
      order by p.newest_at desc, p.newest_id desc
    ), '[]'::jsonb),
    max(p.all_groups)
  into v_items, v_total
  from page p
  join public.notifications n on n.id = p.newest_id;

  if v_total is null then
    select count(distinct case when n.kind = 'sign_helpful' then 'sign:' || n.ref_id else 'n:' || n.id end)
    into v_total from public.notifications n where n.user_id = me;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'nextOffset', case when v_offset + 30 < v_total then v_offset + 30 end
  );
end;
$$;

-- How many notices have something unread (a group of «Me sirvió» counts once).
create or replace function public.my_unread_notices()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct case when n.kind = 'sign_helpful' then 'sign:' || n.ref_id else 'n:' || n.id end)::integer
  from public.notifications n
  where n.user_id = public.current_profile_id() and n.read_at is null
$$;

-- Marks one of my notices read; a «Me sirvió» of a letrero marks the whole group. Someone else's id changes nothing.
create or replace function public.mark_notice_read(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  n public.notifications;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into n from public.notifications where id = p_id and user_id = me;
  if not found then return; end if;
  update public.notifications o
  set read_at = now()
  where o.user_id = me
    and o.read_at is null
    and (o.id = n.id or (n.kind = 'sign_helpful' and o.kind = 'sign_helpful' and o.ref_id = n.ref_id));
end;
$$;

-- «Marcar todo como leído».
create or replace function public.mark_all_notices_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.notifications set read_at = now() where user_id = me and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only signed-in people, each about their own rows. notice_item is an internal helper.
-- ---------------------------------------------------------------------------
revoke all on function
  public.notice_item(public.notifications), public.my_notifications(integer), public.my_unread_notices(),
  public.mark_notice_read(bigint), public.mark_all_notices_read()
  from public, anon;
-- Supabase grants new functions to authenticated by default: the helper is revoked from it explicitly
revoke all on function public.notice_item(public.notifications) from authenticated;
grant execute on function
  public.my_notifications(integer), public.my_unread_notices(), public.mark_notice_read(bigint), public.mark_all_notices_read()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the bell changes by itself. RLS (0002) delivers to each person only their own rows.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
