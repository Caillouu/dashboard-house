import type { Client } from '@libsql/client'
import { alexa } from '../server/alexa.ts'
import { connectDatabase } from '../server/store.ts'

let db: Client | undefined
export default {
  fetch(request: Request) {
    return alexa(request, () => db ??= connectDatabase(process.env), process.env)
  },
}
