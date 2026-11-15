import crypto from 'crypto';
import axios from 'axios';

const SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY ?? '';
const PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY ?? '';
const WEBHOOK_HASH = process.env.FLUTTERWAVE_WEBHOOK_HASH ?? '';
const BASE = 'https://api.flutterwave.com/v3';

export interface PaymentPlan {
  amount: number;
  currency: 'EUR' | 'USD';
  planName: string;
  email: string;
  name: string;
  phone?: string;
  redirect_url: string;
  meta?: Record<string, string>;
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const hash = crypto.createHmac('sha256', WEBHOOK_HASH).update(rawBody).digest('hex');
  return hash === signatureHeader;
}

export async function initiatePayment(plan: PaymentPlan): Promise<{ link: string; txRef: string }> {
  const txRef = `SYNTHIA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const payload = {
    tx_ref: txRef,
    amount: plan.amount,
    currency: plan.currency,
    redirect_url: plan.redirect_url,
    payment_options: 'card,mobilemoneyghana,mobilemoneyuganda,mobilemoneyzambia,mpesa,banktransfer',
    customer: {
      email: plan.email,
      phonenumber: plan.phone,
      name: plan.name,
    },
    customizations: {
      title: 'Synthia AI',
      description: `Abonnement ${plan.planName}`,
      logo: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
    },
    meta: plan.meta,
  };

  const res = await axios.post(`${BASE}/payments`, payload, {
    headers: { Authorization: `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' },
  });

  return { link: res.data.data.link, txRef };
}

export async function verifyTransaction(txId: string): Promise<{
  status: string;
  amount: number;
  currency: string;
  email: string;
  meta: Record<string, unknown>;
}> {
  const res = await axios.get(`${BASE}/transactions/${txId}/verify`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });

  const d = res.data.data;
  return {
    status: d.status,
    amount: d.amount,
    currency: d.currency,
    email: d.customer.email,
    meta: d.meta ?? {},
  };
}

export function getPublicKey(): string {
  return PUBLIC_KEY;
}
