import type { Client } from '@libsql/client'
import webpush, { type PushSubscription } from 'web-push'
import type { Member } from '../shared/protocol.ts'

export const TEST_NOTIFICATION = "Ceci est un test pour te dire que je t'aime"

const initialized = new WeakSet<Client>()

export async function ensurePushSubscriptions(db: Client) {
  if (initialized.has(db)) return
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      member TEXT NOT NULL CHECK(member IN ('p1', 'p2')),
      subscription TEXT NOT NULL CHECK(json_valid(subscription)),
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_member ON push_subscriptions(member);
  `)
  initialized.add(db)
}

type NotificationPayload = { title: string; body: string; url?: string; tag?: string }

function errorDetails(error: unknown, endpoint: string) {
  const details = typeof error === 'object' && error ? error as {
    statusCode?: unknown
    body?: unknown
    endpoint?: unknown
  } : {}
  let endpointHost = 'unknown'
  try { endpointHost = new URL(String(details.endpoint || endpoint)).hostname } catch {}
  return {
    statusCode: Number(details.statusCode) || 0,
    endpointHost,
    body: String(details.body || '').slice(0, 500),
  }
}

async function send(subscription: PushSubscription, payload: NotificationPayload) {
  return webpush.sendNotification(subscription, JSON.stringify({ url: '/', ...payload }), { TTL: 86400 })
}

function vapid(env: NodeJS.ProcessEnv) {
  const publicKey = env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const subject = env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) throw new Error('VAPID configuration is required')
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return publicKey
}

function validPushEndpoint(endpoint: string) {
  const { protocol, hostname } = new URL(endpoint)
  const allowed = ['googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com']
  return protocol === 'https:' && allowed.some(domain => hostname === domain || hostname.endsWith('.' + domain))
}

export function pushPublicKey(env: NodeJS.ProcessEnv) {
  return vapid(env)
}

export async function subscribeAndSendTest(db: Client, member: Member, subscription: PushSubscription, env: NodeJS.ProcessEnv) {
  if (!validPushEndpoint(subscription.endpoint)) throw new Error('Unsupported push endpoint')
  vapid(env)
  await ensurePushSubscriptions(db)
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, member, subscription, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(endpoint) DO UPDATE SET member = excluded.member,
        subscription = excluded.subscription, updated_at = excluded.updated_at`,
    args: [subscription.endpoint, member, JSON.stringify(subscription)],
  })
  try {
    await send(subscription, {
      title: 'Maison', body: TEST_NOTIFICATION, url: '/', tag: 'notification-test',
    })
    return { testSent: true }
  } catch (error) {
    console.error('Web push rejected', errorDetails(error, subscription.endpoint))
    await unsubscribe(db, subscription.endpoint, member)
    throw error
  }
}

export async function sendMemberNotification(db: Client, member: Member, payload: NotificationPayload, env: NodeJS.ProcessEnv) {
  vapid(env)
  await ensurePushSubscriptions(db)
  const { rows } = await db.execute({
    sql: 'SELECT endpoint, subscription FROM push_subscriptions WHERE member = ?', args: [member],
  })
  let sent = 0
  for (const row of rows) {
    const endpoint = String(row.endpoint)
    try {
      await send(JSON.parse(String(row.subscription)) as PushSubscription, payload)
      sent++
    } catch (error) {
      const details = errorDetails(error, endpoint)
      console.error('Scheduled web push rejected', details)
      if (details.statusCode === 404 || details.statusCode === 410) await unsubscribe(db, endpoint, member)
    }
  }
  return sent
}

export async function unsubscribe(db: Client, endpoint: string, member: Member) {
  await ensurePushSubscriptions(db)
  await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND member = ?', args: [endpoint, member] })
}
