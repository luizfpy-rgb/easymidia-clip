-- Aprovação de clip com débito atômico de crédito (revisão M1):
-- dois approves simultâneos não podem estourar o saldo do trial.

create or replace function public.approve_clip(p_clip_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
    from suggested_clips
    where id = p_clip_id and user_id = p_user_id
    for update;
  if not found then
    return 'not_found';
  end if;
  if v_status <> 'suggested' then
    return 'bad_status';
  end if;

  update profiles
    set credits_remaining = credits_remaining - 1
    where id = p_user_id and credits_remaining >= 1;
  if not found then
    return 'no_credits';
  end if;

  update suggested_clips set status = 'approved' where id = p_clip_id;
  return 'ok';
end;
$$;

revoke all on function public.approve_clip(uuid, uuid) from public;
grant execute on function public.approve_clip(uuid, uuid) to service_role;
