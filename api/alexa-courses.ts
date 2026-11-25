import type { Client } from '@libsql/client'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { applyMutation, connectDatabase } from '../server/store.ts'

const bodySchema = z.object({
  requestId: z.string().min(1).max(256),
  article: z.string().trim().min(1).max(160),
})
const digest = (value: string) => createHash('sha256').update(value).digest()
let db: Client | undefined

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    const secret = process.env.ALEXA_COURSES_SECRET
    const authorization = request.headers.get('authorization') || ''
    if (!secret || secret.length < 32 || !timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
      return new Response(null, { status: 401 })
    }

    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return new Response(null, { status: 400 })
    const { requestId, article } = body.data
    const id = 'alexa-' + digest(requestId).toString('hex')
    const hash = digest(id)
    hash[6] = (hash[6] & 15) | 64
    hash[8] = (hash[8] & 63) | 128
    const hex = hash.subarray(0, 16).toString('hex')
    const operationId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
    try {
      const result = await applyMutation(db ??= connectDatabase(process.env), {
        a: 'put', t: 'courses', id, revision: 0, operationId,
        row: [id, '', article, '', '', '', '{}'],
      }, 'p1')
      return Response.json({ ok: result.ok }, { status: result.ok ? 200 : 409 })
    } catch {
      return new Response(null, { status: 503 })
    }
  },
}
