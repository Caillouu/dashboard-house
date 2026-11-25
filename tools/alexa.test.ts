import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import test from 'node:test'
import { createClient } from '@libsql/client'
import { alexa } from '../server/alexa.ts'
import { migrate } from './migrate.ts'
import { snapshot } from '../server/store.ts'

test('Alexa authenticates, stores all collections, and replays nested additions once', async () => {
  const db = createClient({ url: 'file::memory:' })
  try {
    await migrate(db)
    const env = { ALEXA_SKILL_SECRET: randomUUID(), ALEXA_MEMBER: 'p1' }
    async function call(action: object, operationId = randomUUID(), secret: string = env.ALEXA_SKILL_SECRET) {
      return alexa(new Request('https://house.test/api/alexa', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, operationId }),
      }), () => db, env)
    }
    const course = { kind: 'course', title: 'Lait', quantity: '2 bouteilles' }
    assert.equal((await call(course, randomUUID(), 'wrong')).status, 401)
    const additions = [
      course, { ...course, title: 'lait' },
      { kind: 'wish', title: 'Lampe' },
      { kind: 'group', title: 'Jardin' },
      { kind: 'routine', title: 'Tailler le rosier', parent: 'jardin' },
      { kind: 'quest', title: 'Ranger', private: true },
      { kind: 'debt', title: 'Déjeuner', amount: 12.50, payer: 'p2' },
      { kind: 'trip', title: 'Bretagne', date: '2027-02-15' },
      { kind: 'tripItem', title: 'Aquarium', parent: 'Bretagne', type: 'Activité' },
      { kind: 'template', title: 'Week-end' },
    ]
    for (const action of additions) {
      assert.equal((await call(action)).status, 200, action.kind)
    }
    for (const action of [
      { kind: 'step', title: 'Trier les boîtes', parent: 'Ranger' },
      { kind: 'packing', title: 'Chargeur', parent: 'Bretagne', template: false, category: false },
      { kind: 'packing', title: 'Vêtements', parent: 'Week-end', template: true, category: true },
    ]) {
      const id = randomUUID()
      assert.equal((await call(action, id)).status, 200)
      assert.equal((await call(action, id)).status, 200)
    }
    assert.equal((await call({ kind: 'step', title: 'Inconnue', parent: 'Absent' })).status, 422)
    const { sheets } = await snapshot(db, env, 'p1')
    assert.equal(sheets.courses.length, 1)
    assert.equal(sheets.courses[0][3], '2 bouteilles')
    assert.equal(sheets.shop[0][2], 'Lampe')
    assert.equal(sheets.routines.find(row => row[3] === 'Tailler le rosier')?.[1], 'Jardin')
    assert.equal(sheets.projects[0][4], 'Trier les boîtes')
    assert.equal((await snapshot(db, env, 'p2')).sheets.projects.length, 0)
    assert.equal(sheets.debts[0][2], 12.5)
    assert.equal(sheets.voyages.find(row => row[3] === 'Valise')?.[9], 'Chargeur')
    assert.equal(sheets.voyages.find(row => row[3] === 'Week-end')?.[9], '# Vêtements')
  } finally { db.close() }
})

test('Alexa creates a timed event on the configured calendar and reuses the event ID', async (t) => {
  const env = {
    ALEXA_SKILL_SECRET: randomUUID(), ALEXA_MEMBER: 'p2', ALEXA_CALENDAR_ID: 'family',
    CALENDAR_IDS: 'other,family', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh',
  }
  let event: Record<string, unknown> | undefined
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://oauth2.googleapis.com/')) return Response.json({ access_token: 'token' })
    assert.match(url, /\/calendars\/family\/events/)
    if (init?.method !== 'POST') return Response.json(event)
    const proposed = JSON.parse(String(init.body))
    if (event) {
      assert.equal(proposed.id, event.id)
      return new Response(null, { status: 409 })
    }
    event = proposed
    return Response.json(event)
  })
  const operationId = randomUUID()
  const action = { kind: 'event', title: 'Dentiste', date: '2027-02-15', time: '10:00', endTime: '10:30' }
  const call = () => alexa(new Request('https://house.test/api/alexa', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ALEXA_SKILL_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId, action }),
  }), () => { throw new Error('Agenda does not use Turso') }, env)
  assert.equal((await call()).status, 200)
  assert.equal((await call()).status, 200)
  assert.deepEqual(event?.start, { dateTime: '2027-02-15T10:00:00', timeZone: 'Europe/Paris' })
})

test('Alexa voice dialogue writes only after the configured account confirms', async (t) => {
  const { handler } = await import('../alexa/index.mjs')
  const env = {
    ALEXA_SKILL_ID: 'test-skill', ALEXA_ACCOUNT_HASH: createHash('sha256').update('test-user').digest('hex'),
    ALEXA_SKILL_SECRET: randomUUID(), DASHBOARD_HOUSE_URL: 'https://house.test',
  }
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key]
    process.env[key] = value
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
  }
  const send = t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init.body)).action, { kind: 'course', title: 'du lait' })
    return Response.json({ ok: true })
  })
  const context = { System: { application: { applicationId: 'test-skill' }, user: { userId: 'test-user' } } }
  function intent(name: string, attributes?: object, slots?: object) {
    return handler({ context, session: { attributes }, request: { type: 'IntentRequest', intent: { name, slots } } })
  }
  const draft = await intent('Course', undefined, { titre: { value: 'du lait' } })
  assert.ok('sessionAttributes' in draft)
  const confirmation = await intent('Passer', draft.sessionAttributes)
  assert.ok('sessionAttributes' in confirmation && 'outputSpeech' in confirmation.response)
  assert.equal(send.mock.callCount(), 0)
  assert.match(confirmation.response.outputSpeech?.text ?? '', /Tu confirmes/)
  const result = await intent('AMAZON.YesIntent', confirmation.sessionAttributes)
  assert.equal(send.mock.callCount(), 1)
  assert.ok('shouldEndSession' in result.response)
  assert.equal(result.response.shouldEndSession, true)
})
