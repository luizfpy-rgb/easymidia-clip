-- País de origem da descoberta: vira regionCode na busca do YouTube
-- (relevanceLanguage já existia na coluna language).
alter table public.niches add column if not exists region text not null default 'BR';
