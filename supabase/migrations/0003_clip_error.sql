-- Falhas de render/publicação precisam de mensagem por clip.
alter table public.suggested_clips add column error_message text;
