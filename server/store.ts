import { createClient, type Client } from '@libsql/client'
import type { Mutation, Snapshot } from '../shared/protocol.ts'

export function connectDatabase(env: NodeJS.ProcessEnv): Client {
  const url = env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL is required')
  if (env.VERCEL && (!url.startsWith('libsql://') && !url.startsWith('https://') || !env.TURSO_AUTH_TOKEN)) {
    throw new Error('A remote Turso database and token are required on Vercel')
  }
  return createClient({ url, authToken: env.TURSO_AUTH_TOKEN })
}

export async function snapshot(db: Client, env: NodeJS.ProcessEnv): Promise<Snapshot> {
  const { rows } = await db.execute('SELECT collection, id, data, revision FROM records')
  const data: Snapshot = {
    sheets: { projects: [], routines: [], shop: [], courses: [], voyages: [] },
    settings: {},
    revisions: {},
    people: { p1: env.PERSON_1?.slice(0, 30) || 'Membre 1', p2: env.PERSON_2?.slice(0, 30) || 'Membre 2' },
  }
  for (const row of rows) {
    const collection = String(row.collection)
    const id = String(row.id)
    data.revisions[collection + ':' + id] = Number(row.revision)
    if (row.data === null) continue
    const value = JSON.parse(String(row.data))
    if (collection === 'settings') {
      if (id === 'hiddenEvents') data.settings.hiddenEvents = value
      if (id === 'eventNames') data.settings.eventNames = value
    } else if (Object.hasOwn(data.sheets, collection)) {
      data.sheets[collection as keyof Snapshot['sheets']].push(value)
    }
  }
  return data
}

export async function applyMutation(db: Client, op: Mutation) {
  const collection = op.a === 'setting' ? 'settings' : op.t
  const id = op.a === 'setting' ? op.name : op.id
  const data = op.a === 'del' ? null : JSON.stringify(op.a === 'put' ? op.row : op.value)
  const [, result] = await db.batch([
    {
      sql: 'INSERT INTO mutations (id, collection, record_id, data, base_revision) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      args: [op.operationId, collection, id, data, op.revision],
    },
    { sql: 'SELECT * FROM mutations WHERE id = ?', args: [op.operationId] },
  ], 'write')
  const receipt = result.rows[0]
  if (receipt.collection !== collection || receipt.record_id !== id || receipt.data !== data || receipt.base_revision !== op.revision) {
    return { ok: false, error: 'operation' }
  }
  return receipt.applied === 1 ? { ok: true, revision: op.revision + 1 } : { ok: false, error: 'conflict' }
}
