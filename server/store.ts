import { createClient, type Client } from '@libsql/client'
import { createHash } from 'node:crypto'
import type { DashboardRequest, Member, Mutation, Snapshot } from '../shared/protocol.ts'

export function connectDatabase(env: NodeJS.ProcessEnv): Client {
  const url = env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL is required')
  if (env.VERCEL && (!url.startsWith('libsql://') && !url.startsWith('https://') || !env.TURSO_AUTH_TOKEN)) {
    throw new Error('A remote Turso database and token are required on Vercel')
  }
  return createClient({ url, authToken: env.TURSO_AUTH_TOKEN })
}

function projectMetadata(value: unknown) {
  if (!Array.isArray(value) || value.length !== 6) return null
  try {
    const metadata = JSON.parse(String(value[5] || '{}'))
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  } catch { return {} }
}

function projectDone(value: unknown, metadata: Record<string, unknown>) {
  if (!Array.isArray(value)) return false
  if (metadata.status === 'done') return true
  const steps = String(value[4] || '').split('\n').map(step => step.trim()).filter(Boolean)
  return steps.length > 0 && steps.every(step => /^(✓|✔|✅|\[x\]|x\s)\s*/i.test(step))
}

export async function snapshot(db: Client, env: NodeJS.ProcessEnv, member: Member): Promise<Snapshot> {
  const { rows } = await db.execute('SELECT collection, id, data, revision FROM records')
  const data: Snapshot = {
    sheets: { projects: [], routines: [], shop: [], courses: [], voyages: [], debts: [] },
    settings: {},
    revisions: {},
    people: { p1: env.PERSON_1?.slice(0, 30) || 'Membre 1', p2: env.PERSON_2?.slice(0, 30) || 'Membre 2' },
    questScores: { p1: 0, p2: 0 },
  }
  for (const row of rows) {
    const collection = String(row.collection)
    const id = String(row.id)
    if (row.data === null) {
      data.revisions[collection + ':' + id] = Number(row.revision)
      continue
    }
    const value = JSON.parse(String(row.data))
    if (collection === 'projects') {
      const metadata = projectMetadata(value)!
      const isPrivate = metadata.visibility === 'private'
      if (!isPrivate && projectDone(value, metadata) && (metadata.completedBy === 'p1' || metadata.completedBy === 'p2')) {
        data.questScores[metadata.completedBy]++
      }
      if (isPrivate && metadata.createdBy !== member) continue
    }
    data.revisions[collection + ':' + id] = Number(row.revision)
    if (collection === 'settings') {
      if (id === 'hiddenEvents') data.settings.hiddenEvents = value
      if (id === 'eventNames') data.settings.eventNames = value
    } else if (Object.hasOwn(data.sheets, collection)) {
      data.sheets[collection as keyof Snapshot['sheets']].push(value)
    }
  }
  return data
}

export async function applyMutation(db: Client, op: Mutation, member: Member) {
  const collection = op.a === 'setting' ? 'settings' : op.t
  const id = op.a === 'setting' ? op.name : op.id
  const existing = await db.execute({ sql: 'SELECT * FROM mutations WHERE id = ?', args: [op.operationId] })
  if (existing.rows[0]) {
    const receipt = existing.rows[0]
    if (receipt.collection !== collection || receipt.record_id !== id || receipt.base_revision !== op.revision) return { ok: false, error: 'operation' }
    return receipt.applied === 1 ? { ok: true, revision: op.revision + 1 } : { ok: false, error: 'conflict' }
  }
  let value = op.a === 'put' ? op.row : op.a === 'setting' ? op.value : null
  if (op.a === 'put' && op.t === 'projects') {
    const previous = await db.execute({ sql: "SELECT data FROM records WHERE collection = 'projects' AND id = ?", args: [op.id] })
    const previousValue = previous.rows[0]?.data ? JSON.parse(String(previous.rows[0].data)) : null
    const previousMetadata = projectMetadata(previousValue) || {}
    if (previousMetadata.visibility === 'private' && previousMetadata.createdBy !== member) return { ok: false, error: 'forbidden' }
    const metadata = projectMetadata(op.row) || {}
    metadata.createdBy = previousMetadata.createdBy === 'p1' || previousMetadata.createdBy === 'p2' ? previousMetadata.createdBy : member
    metadata.visibility = metadata.visibility === 'private' ? 'private' : 'household'
    if (previousValue && metadata.visibility !== (previousMetadata.visibility === 'private' ? 'private' : 'household') && metadata.createdBy !== member) {
      return { ok: false, error: 'forbidden' }
    }
    const wasDone = projectDone(previousValue, previousMetadata)
    const isDone = projectDone(op.row, metadata)
    if (isDone && !wasDone) metadata.completedBy = member
    if (!isDone) delete metadata.completedBy
    value = [...op.row.slice(0, 5), JSON.stringify(metadata)]
  }
  if (op.a === 'del' && op.t === 'projects') {
    const previous = await db.execute({ sql: "SELECT data FROM records WHERE collection = 'projects' AND id = ?", args: [op.id] })
    const previousValue = previous.rows[0]?.data ? JSON.parse(String(previous.rows[0].data)) : null
    const previousMetadata = projectMetadata(previousValue) || {}
    if (previousMetadata.visibility === 'private' && previousMetadata.createdBy !== member) return { ok: false, error: 'forbidden' }
  }
  const data = value === null ? null : JSON.stringify(value)
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

type CharlieRecommendations = Extract<DashboardRequest, { a: 'charlieRecommendations' }>

export async function addCharlieRecommendations(db: Client, appointments: CharlieRecommendations['appointments']) {
  const statements = appointments.map(appointment => {
    const id = 'charlie-' + createHash('sha256')
      .update(appointment.key).update('\0').update(appointment.dueDate)
      .digest('hex').slice(0, 24)
    const [, month, day] = appointment.dueDate.split('-')
    const metadata = {
      source: 'charlie-monthly-skill',
      recommendationKey: appointment.key,
      dueDate: appointment.dueDate,
      snoozeUntil: appointment.dueDate,
      forceColor: 'o',
      customText: `À faire le ${day}/${month}/${appointment.dueDate.slice(0, 4)}`,
    }
    const row = [id, 'Charlie', '🩺', '[IA] ' + appointment.title, '', '', 'jours', JSON.stringify(metadata)]
    return {
      sql: `INSERT INTO records (collection, id, data, revision)
        VALUES ('routines', ?, ?, 1) ON CONFLICT(collection, id) DO NOTHING`,
      args: [id, JSON.stringify(row)],
    }
  })
  const results = await db.batch(statements, 'write')
  const created = results.reduce((total, result) => total + result.rowsAffected, 0)
  return { created, existing: appointments.length - created }
}
