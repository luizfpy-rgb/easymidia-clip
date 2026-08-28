-- Sistema de avatares: geração a partir de foto (fila generate-avatar via Gemini)
-- e seleção por usuário (render usa profiles.avatar_id; null = sem avatar).
alter table public.avatars
  add column if not exists status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed')),
  add column if not exists error_message text,
  add column if not exists source_image_url text,
  add column if not exists created_at timestamptz not null default now();
alter table public.avatars alter column expressions set default '{}'::jsonb;

alter table public.profiles
  add column if not exists avatar_id uuid references public.avatars (id) on delete set null;
