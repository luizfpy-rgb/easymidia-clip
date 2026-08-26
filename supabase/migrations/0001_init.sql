-- easymidia clip — schema inicial (spec v1.0 + correções da revisão v1.1: I2, I5, I7)
-- Aplicar via SQL Editor do Supabase ou `supabase db push`.

-- ============================================================
-- Perfis (espelho de auth.users — nunca alterar auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'pro', 'agency')),
  credits_remaining int not null default 5,
  -- Referência ao secret no Supabase Vault; a chave Blotato em si nunca fica em coluna (I2)
  blotato_key_secret_id uuid,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Contas de publicação conectadas via Blotato
-- ============================================================
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in (
    'youtube', 'instagram', 'tiktok', 'facebook', 'linkedin',
    'twitter', 'threads', 'pinterest', 'bluesky'
  )),
  handle text not null,
  blotato_account_id text not null,
  -- pageId obrigatório para páginas de Facebook/LinkedIn (revisão C1)
  blotato_page_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, blotato_account_id)
);

-- ============================================================
-- Nichos rastreados
-- ============================================================
create table public.niches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  keywords text[] not null,
  language text not null default 'pt-BR',
  min_views int not null default 100000,
  max_age_days int not null default 30,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Vídeos fonte (ciclo de ingestão próprio — revisão I5)
-- ============================================================
create table public.source_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  niche_id uuid references public.niches (id) on delete set null,
  youtube_id text not null,
  title text not null,
  channel text,
  duration_seconds int,
  views bigint,
  published_at timestamptz,
  discovered_by text not null default 'manual' check (discovered_by in ('ai_discovery', 'manual')),
  -- D1: usuário declara ter direitos/permissão sobre o conteúdo
  rights_confirmed boolean not null default false,
  status text not null default 'pending' check (status in (
    'pending', 'downloading', 'transcribing', 'analyzing', 'done', 'failed'
  )),
  error_message text,
  audio_url text,       -- áudio no R2 para transcrição (revisão C4)
  transcript_url text,  -- SRT no R2
  created_at timestamptz not null default now(),
  unique (user_id, youtube_id)
);

-- ============================================================
-- Trechos sugeridos pela IA (ciclo de publicação próprio)
-- ============================================================
create table public.suggested_clips (
  id uuid primary key default gen_random_uuid(),
  -- denormalizado para RLS e listagens sem join (revisão I2)
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_video_id uuid not null references public.source_videos (id) on delete cascade,
  start_seconds numeric not null,
  end_seconds numeric not null,
  hook text not null,
  score numeric not null check (score >= 0 and score <= 100),
  reason text,
  caption text,
  hashtags text[],
  -- timeline de expressões do avatar, saída da mesma chamada de análise (revisão I4)
  expression_timeline jsonb,
  status text not null default 'suggested' check (status in (
    'suggested', 'approved', 'rejected', 'rendering', 'rendered',
    'scheduled', 'publishing', 'published', 'failed'
  )),
  created_at timestamptz not null default now(),
  check (end_seconds > start_seconds)
);

-- ============================================================
-- Templates visuais (globais no v1)
-- ============================================================
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null,
  is_default boolean not null default false
);

-- ============================================================
-- Avatares (user_id null = global)
-- ============================================================
create table public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  expressions jsonb not null
);

-- ============================================================
-- Shorts renderizados
-- ============================================================
create table public.rendered_shorts (
  id uuid primary key default gen_random_uuid(),
  suggested_clip_id uuid not null references public.suggested_clips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.templates (id),
  avatar_id uuid references public.avatars (id),
  video_url text not null,
  thumbnail_url text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  duration_seconds numeric,
  size_bytes bigint,
  render_cost_usd numeric,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Cronograma: 1 slot = 1 conta = 1 request Blotato (revisão C1)
-- ============================================================
create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  rendered_short_id uuid not null references public.rendered_shorts (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'publishing', 'published', 'failed'
  )),
  blotato_post_id text,
  published_url text,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.user_schedule_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  posts_per_day int not null default 1 check (posts_per_day between 1 and 10),
  active_days text[] not null default array['mon','tue','wed','thu','fri','sat','sun'],
  time_slots time[] not null default array['09:00'::time, '18:00'::time],
  timezone text not null default 'America/Sao_Paulo'
);

-- ============================================================
-- Custos por evento (billing interno)
-- ============================================================
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('transcription', 'analysis', 'render', 'publish')),
  reference_id uuid,
  cost_usd numeric not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Índices (revisão I2)
-- ============================================================
create index on public.source_videos (user_id, created_at desc);
create index on public.source_videos (status) where status not in ('done', 'failed');
create index on public.suggested_clips (user_id, status);
create index on public.suggested_clips (source_video_id);
create index on public.rendered_shorts (user_id, created_at desc);
create index on public.schedule_slots (user_id, scheduled_at);
create index on public.schedule_slots (status, scheduled_at); -- fila do publisher
create index on public.usage_events (user_id, created_at desc);

-- ============================================================
-- RLS: obrigatório em toda tabela — anon key é pública (revisão I2)
-- Workers usam a service role key, que ignora RLS.
-- ============================================================
alter table public.profiles enable row level security;
create policy own_profile on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

alter table public.connected_accounts enable row level security;
create policy own_rows on public.connected_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.niches enable row level security;
create policy own_rows on public.niches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.source_videos enable row level security;
create policy own_rows on public.source_videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.suggested_clips enable row level security;
create policy own_rows on public.suggested_clips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.rendered_shorts enable row level security;
create policy own_rows on public.rendered_shorts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.schedule_slots enable row level security;
create policy own_rows on public.schedule_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_schedule_prefs enable row level security;
create policy own_rows on public.user_schedule_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.usage_events enable row level security;
create policy own_rows_read on public.usage_events
  for select using (auth.uid() = user_id);

alter table public.templates enable row level security;
create policy read_all on public.templates
  for select using (auth.role() = 'authenticated');

alter table public.avatars enable row level security;
create policy global_or_own on public.avatars
  for select using (user_id is null or auth.uid() = user_id);

-- ============================================================
-- Seeds: template split 70/30 e avatar Ryu (URLs entram na Fase 4)
-- ============================================================
insert into public.templates (name, config, is_default) values (
  'Split 70/30 easymidia',
  '{
    "canvas": {"width": 1080, "height": 1920},
    "top": {"height": 1344},
    "bottom": {"height": 576, "background": "#7C3AED"},
    "captions": {"font": "Space Grotesk Bold", "size": 72, "color": "#FFFFFF", "borderColor": "#000000", "borderWidth": 6},
    "logo": {"position": "bottom-left", "opacity": 0.6}
  }'::jsonb,
  true
);

insert into public.avatars (user_id, name, expressions) values (
  null,
  'Ryu',
  '{"idle": null, "curious": null, "impressed": null, "approved": null, "analytical": null}'::jsonb
);
