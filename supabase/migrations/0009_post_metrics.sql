-- Métricas de rede social por post publicado (coletadas do Blotato GET /v2/analytics
-- pela fila collect-metrics a cada 6h; casadas por published_url).
alter table public.schedule_slots
  add column if not exists views bigint,
  add column if not exists likes bigint,
  add column if not exists comments bigint,
  add column if not exists reach bigint,
  add column if not exists metrics_updated_at timestamptz;
