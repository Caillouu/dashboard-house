import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createClient } from '@libsql/client'
import { dashboard } from '../server/handler.ts'
import { migrate } from './migrate.ts'

test('sessions, household state, repeated requests, and stale offline edits', async () => {
  const db = createClient({ url: 'file::memory:' })
  try {
    await migrate(db)
    await migrate(db)
    const env = {
      MEMBER_1_CODE: randomUUID(),
      MEMBER_2_CODE: randomUUID(),
      SESSION_SECRET: randomUUID(),
    }
    async function call(body: object, cookie?: string, origin = 'https://house.test') {
      const headers = new Headers({ 'Content-Type': 'application/json', Origin: origin })
      if (cookie) headers.set('Cookie', cookie)
      return dashboard(new Request('https://house.test/api/dashboard', {
        method: 'POST', headers, body: JSON.stringify(body),
      }), () => db, env)
    }

    assert.equal((await call({ a: 'load' })).status, 401)
    assert.equal((await call({ a: 'load' }, undefined, 'https://other.test')).status, 403)
    assert.equal((await call({ a: 'login', member: 'p1', code: env.MEMBER_2_CODE })).status, 401)

    const login1 = await call({ a: 'login', member: 'p1', code: env.MEMBER_1_CODE })
    const cookie1 = login1.headers.get('set-cookie')!
    assert.match(cookie1, /HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/)
    assert.equal(login1.headers.get('cache-control'), 'private, no-store')
    const empty = await (await call({ a: 'load' }, cookie1)).json()
    assert.deepEqual(empty.sheets.courses, [])

    const first = {
      a: 'put', t: 'courses', id: 'item', revision: 0, operationId: randomUUID(),
      row: ['item', '🥛', 'Lait', '1', '', '', '{}'],
    }
    assert.deepEqual(await (await call(first, cookie1)).json(), { ok: true, revision: 1 })

    const login2 = await call({ a: 'login', member: 'p2', code: env.MEMBER_2_CODE })
    const cookie2 = login2.headers.get('set-cookie')!
    const shared = await (await call({ a: 'load' }, cookie2)).json()
    assert.equal(shared.member, 'p2')
    assert.deepEqual(shared.sheets.courses, [first.row])
    assert.equal(shared.revisions['courses:item'], 1)

    const newer = {
      ...first, revision: 1, operationId: randomUUID(),
      row: ['item', '🥛', 'Lait', '2', '', 'oui', '{}'],
    }
    assert.deepEqual(await (await call(newer, cookie2)).json(), { ok: true, revision: 2 })
    assert.deepEqual(await (await call(first, cookie1)).json(), { ok: true, revision: 1 })
    const stale = await call({ ...first, operationId: randomUUID() }, cookie1)
    assert.equal(stale.status, 409)
    assert.equal((await stale.json()).error, 'conflict')
    assert.deepEqual((await (await call({ a: 'load' }, cookie1)).json()).sheets.courses, [newer.row])

    const deletion = { a: 'del', t: 'courses', id: 'item', revision: 2, operationId: randomUUID() }
    assert.deepEqual(await (await call(deletion, cookie2)).json(), { ok: true, revision: 3 })
    const deleted = await (await call({ a: 'load' }, cookie1)).json()
    assert.deepEqual(deleted.sheets.courses, [])
    assert.equal(deleted.revisions['courses:item'], 3)
    assert.equal((await call({ ...first, operationId: randomUUID(), row: ['invalid'] }, cookie1)).status, 400)
    assert.deepEqual(await (await call({ a: 'agenda' }, cookie1)).json(), { ok: true, events: [], calendars: [] })
    assert.match((await call({ a: 'logout' }, cookie1)).headers.get('set-cookie')!, /Max-Age=0/)
  } finally {
    db.close()
  }
})
