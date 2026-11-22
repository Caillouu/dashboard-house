import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createClient } from '@libsql/client'
import { dashboard } from '../server/handler.ts'
import { migrate } from './migrate.ts'
import { mascotPhrase, randomMascot } from '../src/mascot.ts'
import { isDisplayableRecord } from '../src/records.ts'

test('mascots alternate and keep their matching phrase', () => {
  const first = randomMascot()
  const second = randomMascot(first.name)
  assert.notEqual(second.name, first.name)
  assert.match(mascotPhrase(first, 'sunny'), new RegExp(first.name))
  assert.match(mascotPhrase(second, 'unknown'), new RegExp(second.name))
})

test('a custom routine marker remains displayable after a server reload', () => {
  assert.equal(isDisplayableRecord('routines', {
    id: 'bike', group: 'Vélo', title: '', grp: 1,
  }), true)
  assert.equal(isDisplayableRecord('routines', {
    id: 'broken', group: '', title: '', grp: 1,
  }), false)
  assert.equal(isDisplayableRecord('projects', {
    id: 'empty-project', title: '',
  }), false)
})

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
    assert.deepEqual(empty.sheets.debts, [])

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

    const debt = {
      a: 'put', t: 'debts', id: 'groceries', revision: 0, operationId: randomUUID(),
      row: ['groceries', 'Courses du dimanche', 42.5, 'p1', '{}'],
    }
    assert.deepEqual(await (await call(debt, cookie1)).json(), { ok: true, revision: 1 })
    const sharedDebt = await (await call({ a: 'load' }, cookie2)).json()
    assert.deepEqual(sharedDebt.sheets.debts, [debt.row])

    const privateQuest = {
      a: 'put', t: 'projects', id: 'secret', revision: 0, operationId: randomUUID(),
      row: ['secret', '👻', 'Surprise', '', '', JSON.stringify({ visibility: 'private', createdBy: 'p2' })],
    }
    assert.deepEqual(await (await call(privateQuest, cookie1)).json(), { ok: true, revision: 1 })
    const p1Quests = await (await call({ a: 'load' }, cookie1)).json()
    assert.equal(p1Quests.sheets.projects.length, 1)
    assert.deepEqual(JSON.parse(p1Quests.sheets.projects[0][5]), {
      visibility: 'private', createdBy: 'p1',
    })
    const p2Quests = await (await call({ a: 'load' }, cookie2)).json()
    assert.deepEqual(p2Quests.sheets.projects, [])
    assert.equal(p2Quests.revisions['projects:secret'], undefined)
    assert.equal((await call({ ...privateQuest, revision: 1, operationId: randomUUID() }, cookie2)).status, 403)

    const sharedQuest = {
      a: 'put', t: 'projects', id: 'shared', revision: 0, operationId: randomUUID(),
      row: ['shared', '✨', 'Quête commune', '', '', '{}'],
    }
    assert.deepEqual(await (await call(sharedQuest, cookie1)).json(), { ok: true, revision: 1 })
    const stolenVisibility = {
      ...sharedQuest, revision: 1, operationId: randomUUID(),
      row: ['shared', '✨', 'Quête commune', '', '', JSON.stringify({ visibility: 'private' })],
    }
    assert.equal((await call(stolenVisibility, cookie2)).status, 403)
    const completedQuest = {
      ...sharedQuest, revision: 1, operationId: randomUUID(),
      row: ['shared', '✨', 'Quête commune', '', '', JSON.stringify({ status: 'done' })],
    }
    assert.deepEqual(await (await call(completedQuest, cookie2)).json(), { ok: true, revision: 2 })
    assert.deepEqual(await (await call(completedQuest, cookie2)).json(), { ok: true, revision: 2 })
    const scored = await (await call({ a: 'load' }, cookie1)).json()
    assert.deepEqual(scored.questScores, { p1: 0, p2: 1 })
    assert.deepEqual(JSON.parse(scored.sheets.projects.find((row: string[]) => row[0] === 'shared')[5]), {
      status: 'done', createdBy: 'p1', visibility: 'household', completedBy: 'p2',
    })

    const routine = {
      a: 'put', t: 'routines', id: 'dishes', revision: 0, operationId: randomUUID(),
      row: ['dishes', 'Maison', '🍽️', 'Vaisselle', '', '1', 'jours', '{}'],
    }
    assert.deepEqual(await (await call(routine, cookie1)).json(), { ok: true, revision: 1 })
    const doneByPierre = {
      ...routine, revision: 1, operationId: randomUUID(),
      row: ['dishes', 'Maison', '🍽️', 'Vaisselle', '2026-11-22', '1', 'jours', JSON.stringify({ hasPrev: true, prevDone: null })],
    }
    assert.deepEqual(await (await call(doneByPierre, cookie1)).json(), { ok: true, revision: 2 })
    assert.deepEqual(await (await call(doneByPierre, cookie1)).json(), { ok: true, revision: 2 })
    assert.deepEqual((await (await call({ a: 'load' }, cookie2)).json()).routineScores, { p1: 1, p2: 0 })
    const doneByJustine = {
      ...routine, revision: 2, operationId: randomUUID(),
      row: ['dishes', 'Maison', '🍽️', 'Vaisselle', '2026-11-23', '1', 'jours', JSON.stringify({ hasPrev: true, prevDone: '2026-11-22' })],
    }
    assert.deepEqual(await (await call(doneByJustine, cookie2)).json(), { ok: true, revision: 3 })
    assert.deepEqual((await (await call({ a: 'load' }, cookie1)).json()).routineScores, { p1: 1, p2: 1 })
    const undoJustine = {
      ...routine, revision: 3, operationId: randomUUID(),
      row: ['dishes', 'Maison', '🍽️', 'Vaisselle', '2026-11-22', '1', 'jours', '{}'],
    }
    assert.deepEqual(await (await call(undoJustine, cookie2)).json(), { ok: true, revision: 4 })
    assert.deepEqual((await (await call({ a: 'load' }, cookie1)).json()).routineScores, { p1: 1, p2: 0 })

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

test('Charlie monthly recommendations are authenticated, dated, and idempotent', async () => {
  const db = createClient({ url: 'file::memory:' })
  try {
    await migrate(db)
    const env = {
      CHARLIE_SKILL_SECRET: 'charlie-skill-secret-that-is-long-enough',
    }
    const body = {
      a: 'charlieRecommendations',
      appointments: [{
        key: 'vaccin-rappel-2027',
        title: 'Prendre rendez-vous pour le rappel de vaccin',
        dueDate: '2027-04-15',
      }],
    }
    const call = (authorization?: string) => dashboard(new Request('https://house.test/api/dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
    }), () => db, env)

    assert.equal((await call()).status, 401)
    assert.equal((await call('Bearer wrong-secret')).status, 401)

    const first = await call('Bearer ' + env.CHARLIE_SKILL_SECRET)
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { ok: true, created: 1, existing: 0 })

    const second = await call('Bearer ' + env.CHARLIE_SKILL_SECRET)
    assert.deepEqual(await second.json(), { ok: true, created: 0, existing: 1 })

    const { rows } = await db.execute("SELECT id, data, revision FROM records WHERE collection = 'routines'")
    assert.equal(rows.length, 1)
    const routine = JSON.parse(String(rows[0].data))
    assert.equal(routine[1], 'Charlie')
    assert.equal(routine[3], '[IA] Prendre rendez-vous pour le rappel de vaccin')
    assert.equal(routine[4], '')
    assert.equal(routine[5], '')
    assert.equal(routine[6], 'jours')
    assert.deepEqual(JSON.parse(routine[7]), {
      source: 'charlie-monthly-skill',
      recommendationKey: 'vaccin-rappel-2027',
      dueDate: '2027-04-15',
      snoozeUntil: '2027-04-15',
      forceColor: 'o',
      customText: 'À faire le 15/04/2027',
    })
    assert.equal(rows[0].revision, 1)
  } finally {
    db.close()
  }
})
