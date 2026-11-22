import type { Collection } from '../shared/protocol.ts'

type LoadedRecord = { id?: unknown; title?: unknown; group?: unknown; grp?: unknown }

export function isDisplayableRecord(collection: Collection, record: LoadedRecord) {
  if (!record.id) return false
  if (record.title) return true
  return collection === 'routines' && Boolean(record.grp && record.group)
}
