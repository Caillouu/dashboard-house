import type { Client } from '@libsql/client'
import { timingSafeEqual, createHash } from 'node:crypto'
import { runScheduledNotifications } from '../server/notifications.ts'
import { connectDatabase } from '../server/store.ts'

let db: Client | undefined
const digest = (value: string) => createHash('sha256').update(value).digest()

export default {
  async fetch(request: Request) {
    const secret = process.env.CRON_SECRET
    const authorization = request.headers.get('authorization') || ''
    if (!secret || secret.length < 32 || !timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
      return Response.json({ ok: false }, { status: 401 })
    }
    try {
      const result = await runScheduledNotifications(db ??= connectDatabase(process.env), process.env)
      return Response.json({ ok: true, ...result })
    } catch (error) {
      console.error('Scheduled notifications', error instanceof Error ? error.message : 'Unknown error')
      return Response.json({ ok: false }, { status: 503 })
    }
  },
}
