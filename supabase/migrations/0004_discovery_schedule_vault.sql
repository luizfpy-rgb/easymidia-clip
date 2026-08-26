-- Fase 5/6: cache de descoberta, aprovação de slot e Vault pra chave Blotato.

-- Cache 24h da descoberta por nicho (risco de quota — spec §12)
alter table public.niches add column last_discovery_at timestamptz;

-- Bandeja: aprovação final individual antes de enviar ao Blotato (spec fluxo [11])
alter table public.schedule_slots add column approved boolean not null default false;
create index on public.schedule_slots (status) where status = 'publishing';

-- Chave Blotato do cliente no Supabase Vault (revisão I2).
-- Funções security definer com EXECUTE restrito ao service_role: a chave nunca
-- transita por policy nem aparece em resposta de API.
create or replace function public.store_blotato_key(p_user_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
begin
  select blotato_key_secret_id into v_existing from profiles where id = p_user_id;
  if v_existing is not null then
    perform vault.update_secret(v_existing, p_key);
  else
    update profiles
      set blotato_key_secret_id = vault.create_secret(p_key, 'blotato_' || p_user_id::text)
      where id = p_user_id;
  end if;
end;
$$;

create or replace function public.get_blotato_key(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select ds.decrypted_secret
    from profiles p
    join vault.decrypted_secrets ds on ds.id = p.blotato_key_secret_id
    where p.id = p_user_id;
$$;

revoke all on function public.store_blotato_key(uuid, text) from public;
revoke all on function public.get_blotato_key(uuid) from public;
grant execute on function public.store_blotato_key(uuid, text) to service_role;
grant execute on function public.get_blotato_key(uuid) to service_role;
