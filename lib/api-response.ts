import { NextResponse } from 'next/server';
import { AgentError } from './agent-api';

/** Uniform JSON errors for the REST API v1. */
export function apiError(e: unknown) {
  if (e instanceof AgentError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  console.error('[api v1]', e);
  return NextResponse.json({ error: 'internal', message: 'Internal error' }, { status: 500 });
}
export const needAuth = () => NextResponse.json({ error: 'unauthorized', message: 'Send "Authorization: Bearer syn_…" (create a token in Synthia > AI connections)' }, { status: 401 });
