import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, verifyTransaction } from '@/lib/flutterwave';

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

async function activatePlan(email: string, plan: string, txRef: string) {
  // TODO: write to your DB — shown as console for clarity
  console.log(`[Billing] Activate plan "${plan}" for ${email} — tx:${txRef}`);
}

async function cancelSubscription(email: string) {
  console.log(`[Billing] Cancel subscription for ${email}`);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('verif-hash') ?? '';

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

    const planName = (data.meta?.plan as string) ?? 'starter';
    await activatePlan(data.customer.email, planName, data.tx_ref);
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
