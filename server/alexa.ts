import { createHash, timingSafeEqual } from 'node:crypto'
import type { Client } from '@libsql/client'
import { z } from 'zod'
import type { Collection, Member, Mutation } from '../shared/protocol.ts'
import { createAgendaEvent, alexaCalendarKey } from './integrations.ts'
import { applyMutation } from './store.ts'

const label = z.string().trim().min(1).max(120).regex(/^[^\r\n\x00-\x1f]+$/u)
const date = z.iso.date()
const time = z.iso.time({ precision: -1 })
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('course'), title: label, quantity: label.optional() }),
  z.object({ kind: z.literal('wish'), title: label }),
  z.object({ kind: z.literal('group'), title: label.max(24) }),
  z.object({ kind: z.literal('routine'), title: label, parent: label }),
  z.object({ kind: z.literal('quest'), title: label, private: z.boolean() }),
  z.object({ kind: z.literal('step'), title: label, parent: label }),
  z.object({ kind: z.literal('debt'), title: label, payer: z.enum(['p1', 'p2']), amount: z.number().positive().max(100000) }),
  z.object({ kind: z.literal('trip'), title: label, date: date.optional(), endDate: date.optional() }),
  z.object({ kind: z.literal('tripItem'), title: label, parent: label, type: z.enum(['Activité', 'Hébergement', 'Trajet', 'Transport sur place']) }),
  z.object({ kind: z.literal('template'), title: label }),
  z.object({ kind: z.literal('packing'), title: label, parent: label, template: z.boolean(), category: z.boolean() }),
  z.object({ kind: z.literal('event'), title: label, date, endDate: date.optional(), time: time.optional(), endTime: time.optional() }),
])

const incoming = z.object({ operationId: z.uuid(), action })
type Action = z.infer<typeof action>
type Row = (string | number)[]
type RecordRow = { row: Row; revision: number }

const normalize = (value: string | number) => String(value).trim().toLowerCase().normalize('NFD')
  .replace(/\p{M}/gu, '').replace(/[’']/g, "'").replace(/\s+/g, ' ')
const metadata = (value: string | number) => JSON.parse(String(value || '{}'))
const defaults = new Map([
  ['maison', 'Maison'], ['entretien', 'Maison'], ['menage', 'Maison'],
  ['plantes', 'Plantes'], ['joey', 'Joey'], ['charlie', 'Charlie'], ['justine', 'Justine'],
])
const digest = (value: string) => createHash('sha256').update(value).digest()
const reply = (value: object, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } })

class VoiceError extends Error {}

async function records(db: Client, collection: Collection) {
  const { rows } = await db.execute({
    sql: 'SELECT data, revision FROM records WHERE collection = ? AND data IS NOT NULL',
    args: [collection],
  })
  return rows.map(({ data, revision }): RecordRow => ({ row: JSON.parse(String(data)), revision: Number(revision) }))
}

function findOne(matches: RecordRow[]) {
  if (matches.length !== 1) throw new VoiceError(matches.length ? 'ambiguous' : 'missing')
  return matches[0]
}

async function makePut(db: Client, input: Exclude<Action, { kind: 'event' }>, member: Member, operationId: string): Promise<Mutation> {
  const id = 'alexa-' + operationId
  const createdAt = Date.now()
  const key = normalize(input.title)
  const meta = JSON.stringify({ createdAt })
  function put(t: Collection, row: Row, revision = 0): Mutation {
    return { a: 'put', t, row, id: String(row[0]), operationId, revision }
  }
  switch (input.kind) {
    case 'course': {
      const current = (await records(db, 'courses')).find(({ row }) => normalize(row[2]) === key)
      if (!current) return put('courses', [id, '', input.title, input.quantity ?? '', '', '', meta])
      const row = [...current.row]
      row[3] = input.quantity ?? row[3]
      row[5] = ''
      return put('courses', row, current.revision)
    }
    case 'wish':
      return put('shop', [id, '', input.title, '', 'Couple', 'Bientôt', '', '', '', meta])
    case 'group': {
      if (/^(plant|kim|joey|charlie|chien)/.test(key) || defaults.has(key) ||
        (await records(db, 'routines')).some(({ row }) => normalize(row[1]) === key)) {
        throw new VoiceError('exists')
      }
      return put('routines', [id, input.title, '📦', '', '', '', 'jours', JSON.stringify({ createdAt, grp: 1 })])
    }
    case 'routine': {
      const parent = normalize(input.parent)
      const group = defaults.get(parent) ?? (await records(db, 'routines'))
        .find(({ row }) => normalize(row[1]) === parent)?.row[1]
      if (!group) throw new VoiceError('missing')
      const plant = group === 'Plantes'
      return put('routines', [id, group, plant ? '🪴' : '', input.title, '', plant ? 7 : '', 'jours',
        JSON.stringify({ createdAt, autoIcon: !plant, ...(plant ? { verb: 'Arrosé' } : {}) })])
    }
    case 'quest':
      return put('projects', [id, '', input.title, '', '', JSON.stringify({
        createdAt, status: 'todo', prio: 'med', visibility: input.private ? 'private' : 'household',
      })])
    case 'step': {
      const { row, revision } = findOne((await records(db, 'projects')).filter(({ row }) => {
        const { visibility, createdBy } = metadata(row[5])
        return normalize(row[2]) === normalize(input.parent) && (visibility !== 'private' || createdBy === member)
      }))
      const steps = String(row[4])
      if (steps.length + input.title.length + 1 > 30000 || /^(✓|✔|✅|\[x\]|x\s)/i.test(input.title)) {
        throw new VoiceError('invalid')
      }
      return put('projects', [...row.slice(0, 4), [steps, input.title].filter(Boolean).join('\n'), row[5]], revision)
    }
    case 'debt':
      if (input.amount < 0.01) throw new VoiceError('invalid')
      return put('debts', [id, input.title, Math.round(input.amount * 100) / 100, input.payer, meta])
    case 'trip':
      if (input.endDate && (!input.date || input.endDate < input.date)) throw new VoiceError('invalid')
      return put('voyages', [id, '', 'Voyage', input.title, input.date ?? '', input.endDate ?? input.date ?? '', '', '', '', '', '', meta])
    case 'tripItem':
    case 'packing': {
      const voyages = await records(db, 'voyages')
      const type = input.kind === 'packing' && input.template ? 'valise' : 'voyage'
      const parent = findOne(voyages.filter(({ row }) => !row[1] && normalize(row[2]) === type && normalize(row[3]) === normalize(input.parent)))
      if (input.kind === 'tripItem') return put('voyages', [
        id, parent.row[0], input.type, input.title, '', '', '', '', '', '', '',
        JSON.stringify({ createdAt, ...(input.type === 'Activité' ? { when: 'place' } : {}), ...(input.type === 'Hébergement' ? { hk: 'loc' } : {}) }),
      ])
      if (/^(#|✓|✔|✅|\[x\]|x\s)/i.test(input.title)) throw new VoiceError('invalid')
      const line = (input.category ? '# ' : '') + input.title
      const matches = voyages.filter(({ row }) => row[1] === parent.row[0] && normalize(row[2]) === 'valise')
      const pack = input.template ? parent : matches.length ? findOne(matches) : undefined
      if (!pack) return put('voyages', ['pack-' + parent.row[0], parent.row[0], 'Valise', 'Valise', '', '', '', '', '', line, '', meta])
      const row = [...pack.row]
      const lines = String(row[9]).split('\n').filter(Boolean)
      if (lines.length >= 200) throw new VoiceError('invalid')
      row[9] = [...lines, line].join('\n')
      return put('voyages', row, pack.revision)
    }
    case 'template':
      return put('voyages', [id, '', 'Valise', input.title, '', '', '', '', '', '', '', JSON.stringify({ createdAt, emoji: '🧳' })])
  }
}

export async function alexa(req: Request, getDb: () => Client, env: NodeJS.ProcessEnv) {
  if (req.method !== 'POST') return reply({ ok: false, error: 'method' }, 405)
  const secret = env.ALEXA_SKILL_SECRET
  const member = env.ALEXA_MEMBER
  const auth = req.headers.get('authorization') ?? ''
  if (!secret || secret.length < 32 || (member !== 'p1' && member !== 'p2') ||
      !timingSafeEqual(digest(auth), digest('Bearer ' + secret))) {
    return reply({ ok: false, error: 'auth' }, 401)
  }
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') ?? '')) {
    return reply({ ok: false, error: 'type' }, 415)
  }
  try {
    const body = await req.text()
    if (Buffer.byteLength(body) > 4096) return reply({ ok: false, error: 'size' }, 413)
    const parsed = incoming.safeParse(JSON.parse(body))
    if (!parsed.success) return reply({ ok: false, error: 'invalid' }, 400)
    const { operationId, action: input } = parsed.data
    // Namespace the mutation receipt to this endpoint and its configured member.
    const fingerprint = digest(JSON.stringify([member, operationId, input])).toString('hex')
    const mutationId = fingerprint.replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*$/, '$1-$2-4$3-8$4-$5')
    if (input.kind === 'event') {
      const calendar = alexaCalendarKey(env)
      if (!calendar) throw new VoiceError('calendar')
      const endDate = input.endDate ?? input.date
      const start = input.time ? input.date + 'T' + input.time : input.date
      const end = input.endTime ? endDate + 'T' + input.endTime : endDate
      if (Boolean(input.time) !== Boolean(input.endTime) || end < start || (input.time && end === start)) {
        throw new VoiceError('invalid')
      }
      await createAgendaEvent(env, calendar, input.title, start, end, !input.time, fingerprint)
    } else {
      const db = getDb()
      const { rows } = await db.execute({ sql: 'SELECT applied FROM mutations WHERE id = ?', args: [mutationId] })
      if (rows[0]) return rows[0].applied === 1 ? reply({ ok: true }) : reply({ ok: false, error: 'conflict' }, 409)
      const op = await makePut(db, input, member, mutationId)
      const result = await applyMutation(db, op, member)
      if (!result.ok) {
        const receipt = await db.execute({ sql: 'SELECT applied FROM mutations WHERE id = ?', args: [mutationId] })
        if (receipt.rows[0]?.applied !== 1) return reply({ ok: false, error: 'conflict' }, 409)
      }
    }
    return reply({ ok: true })
  } catch (error) {
    if (error instanceof VoiceError) return reply({ ok: false, error: error.message }, 422)
    if (error instanceof SyntaxError) return reply({ ok: false, error: 'invalid' }, 400)
    return reply({ ok: false, error: 'server' }, 503)
  }
}
