import { z } from 'zod'

export const widths = { routines: 8, shop: 10, projects: 6, courses: 7, voyages: 12, debts: 5 } as const
export const collections = z.enum(['routines', 'shop', 'projects', 'courses', 'voyages', 'debts'])
export type Collection = z.infer<typeof collections>
export type Member = 'p1' | 'p2'
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const metadata = { operationId: z.uuid(), revision: z.number().int().nonnegative() }
const settings = z.discriminatedUnion('name', [
  z.object({ name: z.literal('hiddenEvents'), value: z.array(id).max(500) }),
  z.object({ name: z.literal('eventNames'), value: z.record(id, z.string().max(80)).refine(value => Object.keys(value).length <= 300) }),
])
const put = z.object({
  a: z.literal('put'), t: collections, id,
  row: z.array(z.union([z.string().max(30000), z.number()])),
  ...metadata,
}).refine(op => op.row.length === widths[op.t] && op.row[0] === op.id)
const mutation = z.union([
  put,
  z.object({ a: z.literal('del'), t: collections, id, ...metadata }),
  z.object({ a: z.literal('setting'), ...metadata }).and(settings),
])
const charlieRecommendations = z.object({
  a: z.literal('charlieRecommendations'),
  appointments: z.array(z.object({
    key: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:-]+$/),
    title: z.string().trim().min(1).max(100),
    dueDate: z.iso.date(),
  })).min(1).max(50),
})
export const request = z.union([
  z.object({ a: z.literal('login'), member: z.enum(['p1', 'p2']), code: z.string().min(1).max(200) }),
  z.object({ a: z.enum(['load', 'logout', 'agenda', 'weather']) }),
  charlieRecommendations,
  mutation,
])
export type Mutation = z.infer<typeof mutation>
export type DashboardRequest = z.infer<typeof request>
export type CalendarEvent = {
  id: string
  summary: string
  start: { date: string } | { dateTime: string }
  calendars: string[]
}
export type Agenda = { events: CalendarEvent[]; calendars: { id: string; name: string }[] }
export type Snapshot = {
  sheets: Record<Collection, Array<Array<string | number>>>
  settings: { hiddenEvents?: string[]; eventNames?: Record<string, string> }
  revisions: Record<string, number>
  people: { p1: string; p2: string }
  questScores: { p1: number; p2: number }
  routineScores: { p1: number; p2: number }
}
