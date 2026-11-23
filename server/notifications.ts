import type { Client } from '@libsql/client'
import type { Member } from '../shared/protocol.ts'
import { sendMemberNotification } from './push.ts'

type DebtRow = { data: unknown }
type Scores = Record<Member, number>

const parisDate = (date: Date) => new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date)

function debtData(row: DebtRow) {
  try {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    if (!Array.isArray(data)) return null
    const amount = Number(data[2])
    let metadata: Record<string, unknown> = {}
    try { metadata = JSON.parse(String(data[4] || '{}')) }
    catch { metadata = {} }
    const createdAt = Number(metadata.createdAt)
    return amount > 0 && Number.isFinite(createdAt) ? {
      amount, payer: data[3] === 'p2' ? 'p2' as const : 'p1' as const, createdAt,
    } : null
  } catch { return null }
}

export function debtReminder(rows: DebtRow[], now: Date) {
  const debts = rows.map(debtData).filter((debt): debt is NonNullable<ReturnType<typeof debtData>> => !!debt)
  if (!debts.length) return null
  const signed = debts.reduce((total, debt) => total + (debt.payer === 'p1' ? debt.amount : -debt.amount), 0)
  if (Math.abs(signed) < 0.01) return null
  const firstCreatedAt = Math.min(...debts.map(debt => debt.createdAt))
  if (now.getTime() - firstCreatedAt < 15 * 86400_000) return null
  return {
    member: (signed > 0 ? 'p2' : 'p1') as Member,
    amount: Math.round(Math.abs(signed) * 50) / 100,
  }
}

export function monthlyMessage(scores: Scores, people: Record<Member, string>, month: string) {
  const total = scores.p1 + scores.p2
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(month + '-01T12:00:00Z'))
  if (!total) return { title: `Bilan de ${label}`, body: 'Aucune quête ou routine terminée le mois dernier.' }
  if (scores.p1 === scores.p2) return {
    title: `Bilan de ${label}`,
    body: `Égalité : ${scores.p1} action${scores.p1 > 1 ? 's' : ''} chacun, ${total} au total.`,
  }
  const winner: Member = scores.p1 > scores.p2 ? 'p1' : 'p2'
  const count = scores[winner]
  const percentage = Math.round(count / total * 100)
  return {
    title: `Bilan de ${label}`,
    body: `${people[winner]} en tête : ${count} action${count > 1 ? 's' : ''} sur ${total} (${percentage} %), quêtes et routines confondues.`,
  }
}

async function claim(db: Client, kind: string, period: string, member: Member) {
  const result = await db.execute({
    sql: 'INSERT INTO notification_deliveries (kind, period, member) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    args: [kind, period, member],
  })
  return result.rowsAffected === 1
}

async function release(db: Client, kind: string, period: string, member: Member) {
  await db.execute({
    sql: 'DELETE FROM notification_deliveries WHERE kind = ? AND period = ? AND member = ?',
    args: [kind, period, member],
  })
}

async function deliver(db: Client, kind: string, period: string, member: Member,
  payload: { title: string; body: string; tag: string }, env: NodeJS.ProcessEnv) {
  if (!await claim(db, kind, period, member)) return 0
  const sent = await sendMemberNotification(db, member, payload, env)
  if (!sent) await release(db, kind, period, member)
  return sent
}

function previousMonth(date: Date) {
  const parts = parisDate(date).split('-').map(Number)
  const previous = new Date(Date.UTC(parts[0], parts[1] - 2, 1))
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, 1))
  return { month: previous.toISOString().slice(0, 7), from: previous.toISOString().slice(0, 10), to: next.toISOString().slice(0, 10) }
}

export async function runScheduledNotifications(db: Client, env: NodeJS.ProcessEnv, now = new Date()) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      kind TEXT NOT NULL,
      period TEXT NOT NULL,
      member TEXT NOT NULL CHECK(member IN ('p1', 'p2')),
      PRIMARY KEY(kind, period, member)
    );
  `)
  const today = parisDate(now)
  let sent = 0
  const debts = await db.execute("SELECT data FROM records WHERE collection = 'debts' AND data IS NOT NULL")
  const reminder = debtReminder(debts.rows as unknown as DebtRow[], now)
  if (reminder) {
    const creditor: Member = reminder.member === 'p1' ? 'p2' : 'p1'
    const people = { p1: env.PERSON_1?.slice(0, 30) || 'Membre 1', p2: env.PERSON_2?.slice(0, 30) || 'Membre 2' }
    const amount = reminder.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
    sent += await deliver(db, 'debt-reminder', today, reminder.member, {
      title: 'Petit rappel dettes',
      body: `Tu dois ${amount} à ${people[creditor]}. Pense à rembourser 💸`,
      tag: 'debt-reminder',
    }, env)
  }
  if (today.endsWith('-01')) {
    const range = previousMonth(now)
    const { rows } = await db.execute({
      sql: `SELECT json_extract(data, '$.member') AS member, COUNT(*) AS count
        FROM records WHERE collection IN ('routine_completions', 'project_completions')
        AND json_extract(data, '$.completedDate') >= ? AND json_extract(data, '$.completedDate') < ?
        GROUP BY json_extract(data, '$.member')`,
      args: [range.from, range.to],
    })
    const scores: Scores = { p1: 0, p2: 0 }
    for (const row of rows) if (row.member === 'p1' || row.member === 'p2') scores[row.member] = Number(row.count)
    const people = { p1: env.PERSON_1?.slice(0, 30) || 'Membre 1', p2: env.PERSON_2?.slice(0, 30) || 'Membre 2' }
    const message = monthlyMessage(scores, people, range.month)
    for (const member of ['p1', 'p2'] as const) sent += await deliver(db, 'monthly-score', range.month, member, {
      ...message, tag: 'monthly-score',
    }, env)
  }
  return { sent }
}
