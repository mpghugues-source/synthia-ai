'use strict';

require('dotenv').config({ path: __dirname + '/.env.local' });

const cron   = require('node-cron');
const path   = require('path');
const fs     = require('fs');
const axios  = require('axios');

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000';

const QUEUE_FILE  = path.join(__dirname, 'data', 'queue.json');
const LOCK_FILE   = path.join(__dirname, 'data', '.queue.lock');
const DATA_DIR    = path.join(__dirname, 'data');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readQueue() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); }
  catch { return []; }
}

function writeQueue(jobs) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(jobs, null, 2));
}

function updateJob(id, update) {
  const jobs = readQueue().map(j =>
    j.id === id ? { ...j, ...update, updatedAt: new Date().toISOString() } : j
  );
  writeQueue(jobs);
}

function isLocked() { return fs.existsSync(LOCK_FILE); }

function acquireLock() {
  if (isLocked()) return false;
  try { fs.writeFileSync(LOCK_FILE, String(process.pid)); return true; }
  catch { return false; }
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

// ── Processors ────────────────────────────────────────────────────────────────

async function processRenderVideo(job) {
  const { voicePath, musicPath, title, script, hashtags, duration,
          resolution, musicVolume, platforms, outputPath } = job.payload;

  const res = await axios.post(`${BASE_URL}/api/media/render-video`, {
    jobId:       job.payload.jobId,
    voicePath, musicPath, title, script, hashtags,
    duration: duration ?? 60,
    resolution: resolution ?? '1080x1920',
    musicVolume: musicVolume ?? 0.2,
    platforms:   platforms ?? [],
    async:       false,
  }, { timeout: 600_000 });

  return res.data;
}

async function processPublishSocial(job) {
  const { videoPath, title, description, hashtags, platforms } = job.payload;

  // Call each platform's publish via social-upload lib through internal API
  // (social-upload is server-side only; call via local HTTP to keep cron.js simple)
  const res = await axios.post(`${BASE_URL}/api/social/publish`, {
    videoPath, title, description, hashtags, platforms,
  }, { timeout: 120_000 });

  return res.data;
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick() {
  if (!acquireLock()) {
    console.log('[Cron] Locked — previous job still running, skipping.');
    return;
  }

  try {
    const jobs   = readQueue();
    const pending = jobs.find(j => j.status === 'pending');

    if (!pending) {
      console.log('[Cron] Queue empty.');
      return;
    }

    console.log(`[Cron] Processing job ${pending.id} (${pending.type})`);
    updateJob(pending.id, { status: 'processing' });

    let result;
    switch (pending.type) {
      case 'render_video':
        result = await processRenderVideo(pending);
        break;
      case 'publish_social':
        result = await processPublishSocial(pending);
        break;
      default:
        throw new Error(`Unknown job type: ${pending.type}`);
    }

    updateJob(pending.id, { status: 'done', result });
    console.log(`[Cron] Job ${pending.id} done.`);

  } catch (err) {
    const jobs   = readQueue();
    const failed = jobs.find(j => j.status === 'processing');
    if (failed) {
      const retries = (failed.retries ?? 0) + 1;
      const status  = retries >= 3 ? 'error' : 'pending';
      updateJob(failed.id, { status, retries, error: String(err) });
      console.error(`[Cron] Job ${failed.id} failed (retry ${retries}):`, err.message);
    }
  } finally {
    releaseLock();
  }
}

// ── Schedule (every minute) ───────────────────────────────────────────────────

cron.schedule('* * * * *', () => {
  tick().catch(console.error);
});

console.log('[Cron] Synthia AI queue processor started — running every minute.');

// Run once immediately on start
tick().catch(console.error);
