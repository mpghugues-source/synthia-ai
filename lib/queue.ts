import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/* turbopackIgnore: true */
const DATA_ROOT  = path.join(process.cwd(), 'data');
const QUEUE_FILE = path.join(DATA_ROOT, 'queue.json');
const LOCK_FILE  = path.join(DATA_ROOT, '.queue.lock');

export type JobStatus = 'pending' | 'processing' | 'done' | 'error';

export type JobType = 'render_video' | 'publish_social';

export interface QueueJob {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retries: number;
}

function ensureDir(): void {
  const dir = path.dirname(QUEUE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

function readQueue(): QueueJob[] {
  ensureDir();
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')) as QueueJob[];
  } catch {
    return [];
  }
}

function writeQueue(jobs: QueueJob[]): void {
  ensureDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

export function enqueue(type: JobType, payload: Record<string, unknown>): QueueJob {
  const jobs = readQueue();
  const job: QueueJob = {
    id: uuidv4(),
    type,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payload,
    retries: 0,
  };
  jobs.push(job);
  writeQueue(jobs);
  return job;
}

export function getJob(id: string): QueueJob | undefined {
  return readQueue().find((j) => j.id === id);
}

export function listJobs(status?: JobStatus): QueueJob[] {
  const jobs = readQueue();
  return status ? jobs.filter((j) => j.status === status) : jobs;
}

export function updateJob(id: string, update: Partial<QueueJob>): void {
  const jobs = readQueue().map((j) =>
    j.id === id ? { ...j, ...update, updatedAt: new Date().toISOString() } : j
  );
  writeQueue(jobs);
}

export function isLocked(): boolean {
  return fs.existsSync(LOCK_FILE);
}

export function acquireLock(): boolean {
  if (isLocked()) return false;
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(): void {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

export function getNextPending(): QueueJob | undefined {
  return readQueue().find((j) => j.status === 'pending');
}
