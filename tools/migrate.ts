import { readFile, readdir } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import { connectDatabase } from '../server/store.ts'

export async function migrate(db: Client) {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')
  const dir = new URL('../migrations/', import.meta.url)
  for (const name of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) {
    const result = await db.execute({ sql: 'SELECT 1 FROM schema_migrations WHERE name = ?', args: [name] })
    if (result.rows.length) continue
    const sql = await readFile(new URL(name, dir), 'utf8')
    await db.executeMultiple("BEGIN IMMEDIATE;\n" + sql + "\nINSERT OR IGNORE INTO schema_migrations VALUES ('" + name.replaceAll("'", "''") + "');\nCOMMIT;")
  }
}

if (import.meta.main) {
  const db = connectDatabase(process.env)
  try {
    await migrate(db)
    console.log('Migrations appliquées.')
  } finally {
    db.close()
  }
}
