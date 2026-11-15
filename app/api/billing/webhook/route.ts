import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, verifyTransaction } from '@/lib/flutterwave';
import pool from '@/lib/db';
import { PLAN_LIMITS } from '@/lib/projects';
import { PLAN_PRICES } from '@/lib/pricing';

export const runtime = 'nodejs';

type FlutterwaveEvent =
  | 'charge.completed'
  | 'transfer.completed'
  | 'subscription.cancelled';

interface FlutterwaveWebhookBody {
  event: FlutterwaveEvent;
  data: {
    id: number;
    tx_ref: string;
    status: string;
    amount: number;
    currency: string;
    customer: { email: string; name: string };
    meta?: Record<string, unknown>;
  };
}

// A payment activates a plan only if it paid at least the plan's price in EUR or USD.
const PRICES: Record<string, Record<string, number>> = PLAN_PRICES;

async function activatePlan(email: string, plan: string, amount: number, currency: string, txRef: string) {
  const min = PRICES[plan]?.[currency];
  if (!min || amount < min) {
    console.warn(`[Billing] Payment ${txRef} (${amount} ${currency}) does not match plan "${plan}" — ignored`);
    return;
  }
  const limit = PLAN_LIMITS[plan] ?? 3;
  await pool.query('UPDATE users SET plan = ?, videos_limit = ? WHERE email = ?', [plan, limit < 0 ? 100000 : limit, email]);
  console.log(`[Billing] Activated plan "${plan}" for user — tx:${txRef}`);
}

async function cancelSubscription(email: string) {
  await pool.query("UPDATE users SET plan = 'free', videos_limit = 3 WHERE email = ?", [email]);
  console.log('[Billing] Subscription cancelled');
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('verif-hash') ?? '';

  // Without a configured secret the signature check would be meaningless: refuse everything.
  if (!process.env.FLUTTERWAVE_WEBHOOK_HASH || !process.env.FLUTTERWAVE_SECRET_KEY) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  // Security: verify Flutterwave signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[Billing] Invalid webhook signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: FlutterwaveWebhookBody;
  try {
    body = JSON.parse(rawBody) as FlutterwaveWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, data } = body;

  if (event === 'charge.completed' && data.status === 'successful') {
    // Verify with Flutterwave API (double-check)
    const verified = await verifyTransaction(String(data.id));

    if (verified.status !== 'successful') {
      return NextResponse.json({ error: 'Transaction not verified' }, { status: 400 });
    }

    // Trust only what Flutterwave's API reports, not the webhook body.
    const planName = String(verified.meta?.plan ?? data.meta?.plan ?? '').toLowerCase();
    await activatePlan(verified.email, planName, Number(verified.amount), verified.currency, data.tx_ref);
  }

  if (event === 'subscription.cancelled') {
    await cancelSubscription(data.customer.email);
  }

  return NextResponse.json({ received: true });
}

// Flutterwave may send OPTIONS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type, verif-hash',
    },
  });
}
