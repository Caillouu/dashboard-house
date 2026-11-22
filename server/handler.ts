import type { Client } from '@libsql/client'
import { request } from '../shared/protocol.ts'
import { charlieSkillAuthorized, clearSession, login, user } from './auth.ts'
import { agenda, createAgendaEvent, searchAgenda, weather } from './integrations.ts'
import { addCharlieRecommendations, applyMutation, setRentReceiptStatus, snapshot } from './store.ts'

function reply(value: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  if (cookie) headers.set('Set-Cookie', cookie)
  return Response.json(value, { status, headers })
}

export async function dashboard(req: Request, getDb: () => Client, env: NodeJS.ProcessEnv) {
  if (req.method !== 'POST') return reply({ ok: false, error: 'method' }, 405)
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({ ok: false, error: 'type' }, 415)
  if (req.headers.get('sec-fetch-site') === 'cross-site' ||
      (req.headers.has('origin') && new URL(req.url).origin !== req.headers.get('origin'))) {
    return reply({ ok: false, error: 'origin' }, 403)
  }
  try {
    const body = await req.text()
    if (Buffer.byteLength(body) > 120_000) return reply({ ok: false, error: 'size' }, 413)
    const input = request.safeParse(JSON.parse(body))
    if (!input.success) return reply({ ok: false, error: 'invalid' }, 400)
    const op = input.data
    if (op.a === 'charlieRecommendations') {
      if (!charlieSkillAuthorized(req, env)) return reply({ ok: false, error: 'auth' }, 401)
      return reply({ ok: true, ...await addCharlieRecommendations(getDb(), op.appointments) })
    }
    if (op.a === 'rentReceiptStatus') {
      if (!charlieSkillAuthorized(req, env)) return reply({ ok: false, error: 'auth' }, 401)
      return reply({ ok: true, ...await setRentReceiptStatus(getDb(), op.month, op.status) })
    }
    if (op.a === 'login') {
      const result = await login(req, getDb(), op.member, op.code, env)
      if (result.error) return reply({ ok: false, error: result.error }, result.error === 'locked' ? 429 : 401)
      return reply({ ok: true, member: op.member }, 200, result.cookie)
    }
    if (op.a === 'logout') return reply({ ok: true }, 200, clearSession(req, env))
    const member = user(req, env)
    if (!member) return reply({ ok: false, error: 'auth' }, 401)
    switch (op.a) {
      case 'load': return reply({ ok: true, member, ...await snapshot(getDb(), env, member) })
      case 'agenda': return reply({ ok: true, ...await agenda(env) })
      case 'agendaSearch': return reply({ ok: true, ...await searchAgenda(env, op.from, op.to) })
      case 'agendaCreate': return reply({ ok: true, ...await createAgendaEvent(env, op.calendarId, op.title, op.start, op.end) })
      case 'weather': return reply({ ok: true, weather: await weather(env) })
      case 'put':
      case 'del':
      case 'setting': {
        const result = await applyMutation(getDb(), op, member)
        return reply(result, result.ok ? 200 : result.error === 'forbidden' ? 403 : 409)
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ ok: false, error: 'invalid' }, 400)
    console.error('Dashboard API', error instanceof Error ? error.message : 'Unknown error')
    return reply({ ok: false, error: 'server' }, 503)
  }
}
