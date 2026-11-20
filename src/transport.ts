import type { DashboardRequest, Mutation, Snapshot, Agenda } from '../shared/protocol.ts'

type DashboardResponse = Partial<Snapshot & Agenda> & {
  ok: boolean
  error?: string
  member?: 'p1' | 'p2'
  revision?: number
  weather?: unknown
}

export class APIError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code) }
}

export async function api(action: DashboardRequest['a'], data?: object) {
  const response = await fetch('/api/dashboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, a: action }),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const result: DashboardResponse = await response.json()
  if (!result.ok) throw new APIError(result.error ?? 'server', response.status)
  return result
}

export const cacheKey = 'maison-vercel-snapshot'
export const sessionKey = 'maison-vercel-session'
const prefix = 'maison-vercel-op:'
type Pending = Mutation & { time: number; rejected?: string }

export function readQueue(): Pending[] {
  const pending: Pending[] = []
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix)) continue
    const raw = localStorage.getItem(key)
    if (raw) pending.push(JSON.parse(raw))
  }
  return pending.sort((a, b) => a.time - b.time || a.operationId.localeCompare(b.operationId))
}

export function saveOperation(op: Pending) {
  localStorage.setItem(prefix + op.operationId, JSON.stringify(op))
}

export function removeOperation(op: Pending) {
  localStorage.removeItem(prefix + op.operationId)
}

export const isQueueChange = (key: string | null) => !key || key.startsWith(prefix)
export const target = (op: Pending) => op.a === 'setting' ? 'settings:' + op.name : op.t + ':' + op.id
