import type { Client } from '@libsql/client'
import webpush, { type PushSubscription } from 'web-push'
import type { Member } from '../shared/protocol.ts'

export const TEST_NOTIFICATION = "Ceci est un test pour te dire que je t'aime"

const initialized = new WeakSet<Client>()

async function ensurePushSubscriptions(db: Client) {
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
    await webpush.sendNotification(subscription, JSON.stringify({
      title: 'Maison', body: TEST_NOTIFICATION, url: '/', tag: 'notification-test',
    }))
    return { testSent: true }
  } catch (error) {
    await unsubscribe(db, subscription.endpoint, member)
    throw error
  }
}

export async function unsubscribe(db: Client, endpoint: string, member: Member) {
  await ensurePushSubscriptions(db)
  await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND member = ?', args: [endpoint, member] })
}
