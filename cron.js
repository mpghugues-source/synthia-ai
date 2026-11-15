'use strict';

/**
 * Synthia background worker (synthia-cron.service).
 *
 * Every minute it asks the app to publish the projects whose scheduled time has come
 * (POST /api/internal/publish-due, authenticated with the shared internal token).
 * Renders no longer go through this worker: the app renders in the background itself.
 */
require('dotenv').config({ path: __dirname + '/.env.local' });

const cron   = require('node-cron');
const crypto = require('crypto');
const axios  = require('axios');

const BASE_URL = process.env.SYNTHIA_INTERNAL_URL ?? 'http://127.0.0.1:3000';

function internalToken() {
  const base = process.env.SYNTHIA_INTERNAL_TOKEN || process.env.NEXTAUTH_SECRET || '';
  return crypto.createHash('sha256').update(`synthia-internal:${base}`).digest('hex');
}

let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const res = await axios.post(`${BASE_URL}/api/internal/publish-due`, {}, {
      headers: { 'x-synthia-internal': internalToken() },
      timeout: 300_000,
    });
    const processed = res.data?.processed ?? [];
    if (processed.length) console.log('[Cron] published:', JSON.stringify(processed));
  } catch (err) {
    console.error('[Cron] publish-due failed:', err.response?.status ?? '', err.message);
  } finally {
    busy = false;
  }
}

cron.schedule('* * * * *', () => { tick().catch(console.error); });

console.log('[Cron] Synthia scheduler started — checking scheduled publications every minute.');
