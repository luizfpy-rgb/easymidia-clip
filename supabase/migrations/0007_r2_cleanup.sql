-- Limpeza automática do R2: short publicado há +30 dias tem mp4/thumb apagados
-- do bucket e é marcado aqui. A API exclui expirados da bandeja.
alter table public.rendered_shorts add column if not exists expired_at timestamptz;
