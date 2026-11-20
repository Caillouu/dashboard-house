import type { Client } from '@libsql/client'
import { dashboard } from '../server/handler.ts'
import { connectDatabase } from '../server/store.ts'

let db: Client | undefined
export default {
  fetch(request: Request) {
    return dashboard(request, () => db ??= connectDatabase(process.env), process.env)
  },
}
