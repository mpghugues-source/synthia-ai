/** Monthly plan prices, shared by the landing page, the account page and the billing webhook. */
export type Currency = 'EUR' | 'USD';
export const CURRENCIES: Currency[] = ['EUR', 'USD'];

export const PLAN_PRICES: Record<'starter' | 'creator' | 'studio', Record<Currency, number>> = {
  starter: { EUR: 14, USD: 15 },
  creator: { EUR: 36, USD: 39 },
  studio:  { EUR: 72, USD: 79 },
};

export function formatPrice(amount: number, currency: Currency, lang: 'fr' | 'en'): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount);
}
