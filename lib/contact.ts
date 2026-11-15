/** Public sales contacts (Ikelyane). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'info@ikelyane.com';
export const WHATSAPP_NUMBER = '32466484120';
export const whatsappLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
