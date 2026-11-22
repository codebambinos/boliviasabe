-- 0011_similar_questions_stopwords.sql — «Preguntas parecidas» ignores the words every question has (T31).
-- Before, sharing «donde» or «alguien» was enough, so «¿Dónde venden pollo frito?» suggested useful-looking but
-- unrelated questions. Same rule as before otherwise: from 3 typed words, up to 3 questions of the caller's city
-- that share words of 4+ letters, most shared first. Keep the list in sync with STOPWORDS in src/data/mock/adapter.ts.

create or replace function public.similar_questions(p_text text)
returns jsonb
language sql
stable
as $$
  with words as (
    select w from unnest(regexp_split_to_array(lower(extensions.unaccent(btrim(coalesce(p_text, '')))), '\s+')) w where w <> ''
  ),
  cleaned as (
    -- «¿Dónde?» and «gas,» count as «donde» and «gas»
    select regexp_replace(w, '[^a-z0-9ñ]', '', 'g') w from words
  ),
  keywords as (
    select distinct w from cleaned
    where char_length(w) >= 4
      and w <> all (array[
        'alguien', 'alguna', 'alguno', 'algunos', 'algunas', 'algun', 'algo', 'sabe', 'saben', 'sabes', 'saber',
        'donde', 'adonde', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'como', 'cual', 'cuales', 'cuando', 'quien',
        'quienes', 'para', 'porque', 'pero', 'esta', 'este', 'esto', 'estos', 'estas', 'estan', 'hace', 'hacen',
        'tiene', 'tienen', 'tengo', 'puedo', 'puede', 'pueden', 'podria', 'quiero', 'necesito', 'busco', 'buscando',
        'vende', 'venden', 'conseguir', 'consigo', 'encuentro', 'encontrar', 'comprar', 'conoce', 'conocen',
        'recomienda', 'recomiendan', 'recomiendo', 'favor', 'gracias', 'hola', 'buenas', 'buenos', 'dias', 'tardes',
        'noches', 'aqui', 'alli', 'ahora', 'todo', 'toda', 'todos', 'todas', 'desde', 'hasta', 'entre', 'sobre',
        'cerca', 'mucho', 'mucha', 'muchos', 'poco', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'tambien',
        'solo', 'ayuda', 'ayudar', 'informacion'
      ])
  ),
  city as (
    select coalesce((select p.city from public.profiles p where p.id = public.current_profile_id()), 'Cochabamba') c
  ),
  scored as (
    select q, (select count(*) from keywords k where position(k.w in lower(extensions.unaccent(q.text))) > 0) as score
    from public.questions q, city
    where (select count(*) from words) >= 3
      and q.city = city.c
      and public.item_visible('question', q.id, q.author_id)
  )
  select coalesce(jsonb_agg(public.question_json(s.q) order by s.score desc, (s.q).created_at desc), '[]'::jsonb)
  from (select * from scored where score > 0 order by score desc, (q).created_at desc limit 3) s
$$;
