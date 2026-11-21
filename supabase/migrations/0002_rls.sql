-- 0002_rls.sql
-- Row-level security for every table in 0001 (SPEC 03).
-- A table with RLS enabled and no policy for an operation denies that operation.
-- The service role bypasses RLS; it is used only from Vercel functions (T17).

-- ---------------------------------------------------------------------------
-- Helpers. security definer so they can read profiles without recursing into RLS.
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where p.auth_id = auth.uid()
$$;

create or replace function public.is_profile_owner(p_profile_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile_id = public.current_profile_id()
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallet_keys enable row level security;
alter table public.signs enable row level security;
alter table public.sign_votes enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.answer_comments enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;
alter table public.hidden_items enable row level security;
alter table public.contact_requests enable row level security;
alter table public.saved enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.rewards enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: only the owner reads the full row. Everyone else reads profiles_public.
-- Column grants keep server-only fields (Stellar status and address) out of the client.
-- ---------------------------------------------------------------------------
create policy profiles_select_owner on public.profiles
  for select to authenticated
  using (public.is_profile_owner(id));

create policy profiles_insert_owner on public.profiles
  for insert to authenticated
  with check (auth_id = auth.uid());

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (public.is_profile_owner(id))
  with check (public.is_profile_owner(id) and auth_id = auth.uid());

revoke insert, update on public.profiles from authenticated;
grant insert (auth_id, display_name, full_name, city, zone, phone, share, notif_prefs, theme)
  on public.profiles to authenticated;
grant update (display_name, full_name, city, zone, phone, share, notif_prefs, theme)
  on public.profiles to authenticated;

-- Public columns only. The view runs as its owner, so it bypasses RLS on purpose.
-- 0003 adds stars and badge.
create view public.profiles_public as
  select p.id, p.display_name, p.city, p.zone, p.share
  from public.profiles p;

grant select on public.profiles_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- wallet_keys: no policies. Only the service role reads or writes it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- signs: anyone reads; the author writes; no edits or deletes once someone voted.
-- ---------------------------------------------------------------------------
create policy signs_select_all on public.signs
  for select to anon, authenticated
  using (true);

create policy signs_insert_owner on public.signs
  for insert to authenticated
  with check (public.is_profile_owner(author_id));

create policy signs_update_owner on public.signs
  for update to authenticated
  using (
    public.is_profile_owner(author_id)
    and not exists (select 1 from public.sign_votes v where v.sign_id = signs.id)
  )
  with check (public.is_profile_owner(author_id));

create policy signs_delete_owner on public.signs
  for delete to authenticated
  using (
    public.is_profile_owner(author_id)
    and not exists (select 1 from public.sign_votes v where v.sign_id = signs.id)
  );

-- ---------------------------------------------------------------------------
-- sign_votes: anyone reads; the voter inserts their own vote. Votes are final.
-- ---------------------------------------------------------------------------
create policy sign_votes_select_all on public.sign_votes
  for select to anon, authenticated
  using (true);

create policy sign_votes_insert_voter on public.sign_votes
  for insert to authenticated
  with check (public.is_profile_owner(voter_id));

-- ---------------------------------------------------------------------------
-- questions: anyone reads; the author writes. Status and urgency are server-only.
-- ---------------------------------------------------------------------------
create policy questions_select_all on public.questions
  for select to anon, authenticated
  using (true);

create policy questions_insert_owner on public.questions
  for insert to authenticated
  with check (public.is_profile_owner(author_id));

create policy questions_update_owner on public.questions
  for update to authenticated
  using (public.is_profile_owner(author_id))
  with check (public.is_profile_owner(author_id));

create policy questions_delete_owner on public.questions
  for delete to authenticated
  using (
    public.is_profile_owner(author_id)
    and not exists (select 1 from public.answers a where a.question_id = questions.id)
  );

revoke update on public.questions from authenticated;
grant update (text, photo_url, zone, tags) on public.questions to authenticated;

-- ---------------------------------------------------------------------------
-- answers: anyone reads; the author writes. Text is frozen once a rating exists.
-- ---------------------------------------------------------------------------
create policy answers_select_all on public.answers
  for select to anon, authenticated
  using (true);

create policy answers_insert_author on public.answers
  for insert to authenticated
  with check (public.is_profile_owner(author_id));

create policy answers_update_author on public.answers
  for update to authenticated
  using (
    public.is_profile_owner(author_id)
    and not exists (select 1 from public.ratings r where r.answer_id = answers.id)
  )
  with check (public.is_profile_owner(author_id));

create policy answers_delete_author on public.answers
  for delete to authenticated
  using (
    public.is_profile_owner(author_id)
    and not exists (select 1 from public.ratings r where r.answer_id = answers.id)
  );

revoke update on public.answers from authenticated;
grant update (text) on public.answers to authenticated;

-- ---------------------------------------------------------------------------
-- answer_comments: anyone reads; the author writes and deletes their own.
-- ---------------------------------------------------------------------------
create policy answer_comments_select_all on public.answer_comments
  for select to anon, authenticated
  using (true);

create policy answer_comments_insert_author on public.answer_comments
  for insert to authenticated
  with check (public.is_profile_owner(author_id));

create policy answer_comments_delete_author on public.answer_comments
  for delete to authenticated
  using (public.is_profile_owner(author_id));

-- ---------------------------------------------------------------------------
-- ratings: anyone reads; the question author inserts (the rule is in 0001). No edits.
-- ---------------------------------------------------------------------------
create policy ratings_select_all on public.ratings
  for select to anon, authenticated
  using (true);

create policy ratings_insert_rater on public.ratings
  for insert to authenticated
  with check (public.is_profile_owner(rater_id));

-- ---------------------------------------------------------------------------
-- reports: the reporter sees and writes only their own reports.
-- ---------------------------------------------------------------------------
create policy reports_select_reporter on public.reports
  for select to authenticated
  using (public.is_profile_owner(reporter_id));

create policy reports_insert_reporter on public.reports
  for insert to authenticated
  with check (public.is_profile_owner(reporter_id));

-- ---------------------------------------------------------------------------
-- hidden_items, saved, push_subscriptions: each user manages only their own rows.
-- ---------------------------------------------------------------------------
create policy hidden_items_select_own on public.hidden_items
  for select to authenticated
  using (public.is_profile_owner(user_id));

create policy hidden_items_insert_own on public.hidden_items
  for insert to authenticated
  with check (public.is_profile_owner(user_id));

create policy hidden_items_delete_own on public.hidden_items
  for delete to authenticated
  using (public.is_profile_owner(user_id));

create policy saved_select_own on public.saved
  for select to authenticated
  using (public.is_profile_owner(user_id));

create policy saved_insert_own on public.saved
  for insert to authenticated
  with check (public.is_profile_owner(user_id));

create policy saved_delete_own on public.saved
  for delete to authenticated
  using (public.is_profile_owner(user_id));

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (public.is_profile_owner(user_id));

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (public.is_profile_owner(user_id));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (public.is_profile_owner(user_id));

-- ---------------------------------------------------------------------------
-- contact_requests: the requester and the owner read it; the requester creates it;
-- only the owner accepts or declines it.
-- ---------------------------------------------------------------------------
create policy contact_requests_select_parties on public.contact_requests
  for select to authenticated
  using (public.is_profile_owner(requester_id) or public.is_profile_owner(owner_id));

create policy contact_requests_insert_requester on public.contact_requests
  for insert to authenticated
  with check (public.is_profile_owner(requester_id));

create policy contact_requests_update_owner on public.contact_requests
  for update to authenticated
  using (public.is_profile_owner(owner_id))
  with check (public.is_profile_owner(owner_id));

revoke update on public.contact_requests from authenticated;
grant update (status, answered_at) on public.contact_requests to authenticated;

-- ---------------------------------------------------------------------------
-- notifications: the owner reads, marks as read and deletes. Only the trigger inserts (0003).
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (public.is_profile_owner(user_id));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (public.is_profile_owner(user_id))
  with check (public.is_profile_owner(user_id));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (public.is_profile_owner(user_id));

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- rewards: the owner reads their own rewards. Only the service role writes them (T17).
-- ---------------------------------------------------------------------------
create policy rewards_select_own on public.rewards
  for select to authenticated
  using (public.is_profile_owner(profile_id));
