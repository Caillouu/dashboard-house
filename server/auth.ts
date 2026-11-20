import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Client } from '@libsql/client'

type Member = 'p1' | 'p2'
const cookie = 'maison_session'
const duration = 30 * 86400
const digest = (value: string) => createHash('sha256').update(value).digest()
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

function memberCode(member: Member, env: NodeJS.ProcessEnv) {
  const code = member === 'p1' ? env.MEMBER_1_CODE : env.MEMBER_2_CODE
  return code && code.length >= 32 && code !== (member === 'p1' ? env.MEMBER_2_CODE : env.MEMBER_1_CODE) ? code : null
}

function signature(body: string, code: string, env: NodeJS.ProcessEnv) {
  const secret = env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is required')
  return createHmac('sha256', secret).update(code).update('\0').update(body).digest('base64url')
}

function sessionCookie(value: string, req: Request, env: NodeJS.ProcessEnv, maxAge: number) {
  const secure = env.VERCEL || new URL(req.url).protocol === 'https:'
  return cookie + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secure ? '; Secure' : '')
}

export function clearSession(req: Request, env: NodeJS.ProcessEnv) {
  return sessionCookie('', req, env, 0)
}

export function user(req: Request, env: NodeJS.ProcessEnv): Member | null {
  const raw = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookie + '='))?.slice(cookie.length + 1)
  const match = raw?.match(/^(p[12])\.(\d{10})\.([A-Za-z0-9_-]{43})$/)
  if (!match || Number(match[2]) <= Date.now() / 1000) return null
  const member = match[1] as Member
  const code = memberCode(member, env)
  return code && same(signature(member + '.' + match[2], code, env), match[3]) ? member : null
}

export async function login(req: Request, db: Client, member: Member, entered: string, env: NodeJS.ProcessEnv) {
  const code = memberCode(member, env)
  if (!code) throw new Error('Two distinct random member codes are required')
  const ip = req.headers.get('x-vercel-forwarded-for') ?? 'local'
  const window = Math.floor(Date.now() / 600_000)
  const key = digest(ip).toString('hex')
  const { rows } = await db.execute({
    sql: `INSERT INTO login_limits (key, window, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN login_limits.window = excluded.window
      THEN MIN(login_limits.attempts + 1, 11) ELSE 1 END, window = excluded.window
      RETURNING attempts`,
    args: [key, window],
  })
  if (Number(rows[0].attempts) > 10) return { error: 'locked' as const }
  if (!same(entered, code)) return { error: 'auth' as const }
  const body = member + '.' + (Math.floor(Date.now() / 1000) + duration)
  return { cookie: sessionCookie(body + '.' + signature(body, code, env), req, env, duration) }
}
