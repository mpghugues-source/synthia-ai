'use client';

import { useEffect, useState } from 'react';
import { CONTACT_EMAIL } from '@/lib/contact';

/**
 * E-mail address rendered after hydration. Cloudflare's "email obfuscation" rewrites addresses
 * found in the HTML, which made React's hydration fail (error #418) on pages that show one.
 */
export default function Email({ address = CONTACT_EMAIL, className = 'text-violet-400' }: { address?: string; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);
  const [user, domain] = address.split('@');
  if (!shown) return <span className={className}>{user} [at] {domain}</span>;
  return <a href={`mailto:${address}`} className={className}>{address}</a>;
}
