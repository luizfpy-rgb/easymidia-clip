-- D6: uso próprio primeiro — plano 'internal' sem cobrança nem débito de créditos.
-- Após criar sua conta no app, rode UMA vez:
--   update public.profiles set plan = 'internal' where email = 'SEU_EMAIL_DE_LOGIN';

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('trial', 'starter', 'pro', 'agency', 'internal'));

-- approve_clip: plano internal aprova sem checar/debitar crédito
create or replace function public.approve_clip(p_clip_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan text;
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

  select plan into v_plan from profiles where id = p_user_id;
  if v_plan <> 'internal' then
    update profiles
      set credits_remaining = credits_remaining - 1
      where id = p_user_id and credits_remaining >= 1;
    if not found then
      return 'no_credits';
    end if;
  end if;

  update suggested_clips set status = 'approved' where id = p_clip_id;
  return 'ok';
end;
$$;
