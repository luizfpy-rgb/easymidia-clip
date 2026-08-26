import { Hono } from 'hono';
import { z } from 'zod';
import Stripe from 'stripe';
import { PLANS, type PlanId } from '@easymidia/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

function priceFor(plan: Exclude<PlanId, 'trial'>): string | undefined {
  return {
    starter: env.STRIPE_PRICE_STARTER,
    pro: env.STRIPE_PRICE_PRO,
    agency: env.STRIPE_PRICE_AGENCY,
  }[plan];
}

function planForPrice(priceId: string): Exclude<PlanId, 'trial'> | null {
  if (priceId === env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === env.STRIPE_PRICE_AGENCY) return 'agency';
  return null;
}

export const billing = new Hono<{ Variables: AuthVariables }>().post('/checkout', async (c) => {
  if (!stripe) return c.json({ error: 'billing_not_configured' }, 503);
  const parsed = z
    .object({ plan: z.enum(['starter', 'pro', 'agency']) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const price = priceFor(parsed.data.plan);
  if (!price) return c.json({ error: 'price_not_configured' }, 503);

  const userId = c.get('userId');
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email, stripe_customer_id')
    .eq('id', userId)
    .single();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: userId,
    ...(profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: profile?.email }),
    success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?upgrade=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?upgrade=cancelled`,
  });
  return c.json({ url: session.url });
});

// Público (sem JWT): a autenticidade vem da assinatura do webhook (revisão M7)
export const stripeWebhook = new Hono().post('/', async (c) => {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return c.json({ error: 'not_configured' }, 503);
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'missing_signature' }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await c.req.text(),
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return c.json({ error: 'invalid_signature' }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    if (userId) {
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      const priceId = full.line_items?.data[0]?.price?.id;
      const plan = priceId ? planForPrice(priceId) : null;
      if (plan) {
        await supabaseAdmin
          .from('profiles')
          .update({
            plan,
            credits_remaining: PLANS[plan].shortsPerMonth,
            stripe_customer_id: String(session.customer ?? ''),
          })
          .eq('id', userId);
      }
    }
  } else if (event.type === 'invoice.payment_succeeded') {
    // Renovação mensal: recarrega os créditos do plano
    const invoice = event.data.object;
    const customerId = String(invoice.customer ?? '');
    if (customerId && invoice.billing_reason === 'subscription_cycle') {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, plan')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      if (profile && profile.plan !== 'trial') {
        await supabaseAdmin
          .from('profiles')
          .update({ credits_remaining: PLANS[profile.plan as PlanId].shortsPerMonth })
          .eq('id', profile.id);
      }
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await supabaseAdmin
      .from('profiles')
      .update({ plan: 'trial', credits_remaining: 0 })
      .eq('stripe_customer_id', String(sub.customer ?? ''));
  }

  return c.json({ received: true });
});
