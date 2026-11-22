import { createHash } from 'node:crypto'
import type { Agenda, CalendarEvent } from '../shared/protocol.ts'

type Cache<T> = { value?: T; until: number; pending?: Promise<T> }
async function cached<T>(cache: Cache<T>, ttl: number, read: () => Promise<T>): Promise<T> {
  if (cache.value !== undefined && cache.until > Date.now()) return cache.value
  cache.pending ??= read().then(value => {
    cache.value = value
    cache.until = Date.now() + ttl
    return value
  }).finally(() => { cache.pending = undefined })
  return cache.pending
}

async function json<T>(url: string | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(7000) })
  if (!response.ok) throw new Error('Upstream HTTP ' + response.status)
  return response.json() as Promise<T>
}

const googleToken: Cache<string> = { until: 0 }
const calendarCache: Cache<Agenda> = { until: 0 }
const hash = (value: string) => createHash('sha256').update(value).digest('base64url').slice(0, 16)

type GoogleEvent = {
  id: string
  iCalUID?: string
  summary?: string
  status?: string
  start?: { date?: string; dateTime?: string }
}
type CalendarPage = { summary?: string; nextPageToken?: string; items?: GoogleEvent[] }

function calendarIds(env: NodeJS.ProcessEnv) {
  return [...new Set((env.CALENDAR_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean))]
}

async function googleAccessToken(env: NodeJS.ProcessEnv) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) throw new Error('Google Calendar OAuth is incomplete')
  return cached(googleToken, 1_500_000, async () => {
    const data = await json<{ access_token?: string }>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
      }),
    })
    if (!data.access_token) throw new Error('Google returned no access token')
    return data.access_token
  })
}

function label(summary: string, index: number) {
  const value = summary.trim()
    .replace(/^(?:(?:mon|ma|mes|le|la|les|my|the)\s+)?(?:agenda|calendrier|calendar)\b\s*[:–—-]?\s*(?:(?:de|du|des)\s+|d['’])?/i, '')
    .replace(/\s+(?:agenda|calendrier|calendar)$/i, '')
    .replace(/^([^@\s]+)@[^@\s]+$/, '$1')
    .replace(/^(?:personnel|personnelle)$/i, 'Perso').trim()
  return value ? (value[0].toUpperCase() + value.slice(1)).slice(0, 60) : 'Agenda ' + (index + 1)
}

async function readCalendar(id: string, index: number, token: string, timeMin: string, timeMax: string, maxResults = '80') {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(id) + '/events')
  url.search = new URLSearchParams({
    singleEvents: 'true', orderBy: 'startTime', maxResults,
    timeMin, timeMax,
    timeZone: 'Europe/Paris',
    fields: 'summary,items(id,iCalUID,summary,status,start)',
  }).toString()
  const page = await json<CalendarPage>(url, { headers: { Authorization: 'Bearer ' + token } })
  return { id: hash(id), name: label(page.summary ?? '', index), items: page.items ?? [] }
}

export async function agenda(env: NodeJS.ProcessEnv) {
  const ids = calendarIds(env)
  if (ids.length === 0) return { events: [], calendars: [] }
  return cached(calendarCache, 300_000, async () => {
    const token = await googleAccessToken(env)
    const now = new Date()
    const results = await Promise.allSettled(ids.map((id, i) => readCalendar(id, i, token, now.toISOString(), new Date(now.getTime() + 35 * 864e5).toISOString())))
    const events = new Map<string, CalendarEvent>()
    const calendars: Agenda['calendars'] = []
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        console.warn('Unable to read a configured Google calendar', result.reason instanceof Error ? result.reason.message : '')
        continue
      }
      const { id, name, items } = result.value
      calendars.push({ id, name })
      for (const item of items) {
        const date = item.start?.date
        const dateTime = item.start?.dateTime
        if (!(date || dateTime) || item.status === 'cancelled') continue
        const start = date ?? new Date(dateTime!).toISOString()
        const summary = (item.summary ?? '').slice(0, 120)
        const key = summary + '|' + start
        const existing = events.get(key)
        if (existing) {
          if (!existing.calendars.includes(id)) existing.calendars.push(id)
        } else {
          events.set(key, { id: hash((item.iCalUID ?? item.id) + '|' + start), summary, start: date ? { date } : { dateTime: start }, calendars: [id] })
        }
      }
    }
    if (!calendars.length) throw new Error('No configured Google calendar is accessible')
    const sortKey = (ev: CalendarEvent) => 'date' in ev.start ? ev.start.date : ev.start.dateTime
    return { calendars, events: [...events.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).slice(0, 80) }
  })
}

function parisDate(dateTime: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(dateTime))
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return value.year + '-' + value.month + '-' + value.day
}

export async function searchAgenda(env: NodeJS.ProcessEnv, from: string, to: string) {
  const ids = calendarIds(env)
  if (ids.length === 0) return { events: [], calendars: [] }
  const token = await googleAccessToken(env)
  const after = new Date(Date.parse(to + 'T00:00:00Z') + 2 * 864e5).toISOString()
  const before = new Date(Date.parse(from + 'T00:00:00Z') - 864e5).toISOString()
  const results = await Promise.allSettled(ids.map((id, i) => readCalendar(id, i, token, before, after, '250')))
  const events = new Map<string, CalendarEvent>()
  const calendars: Agenda['calendars'] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') {
      console.warn('Unable to search a configured Google calendar', result.reason instanceof Error ? result.reason.message : '')
      continue
    }
    const { id, name, items } = result.value
    calendars.push({ id, name })
    for (const item of items) {
      const date = item.start?.date
      const dateTime = item.start?.dateTime
      if (!(date || dateTime) || item.status === 'cancelled') continue
      const localDate = date ?? parisDate(dateTime!)
      if (localDate < from || localDate > to) continue
      const start = date ?? new Date(dateTime!).toISOString()
      const summary = (item.summary ?? '').slice(0, 120)
      const key = summary + '|' + start
      const existing = events.get(key)
      if (existing) {
        if (!existing.calendars.includes(id)) existing.calendars.push(id)
      } else {
        events.set(key, { id: hash((item.iCalUID ?? item.id) + '|' + start), summary, start: date ? { date } : { dateTime: start }, calendars: [id] })
      }
    }
  }
  if (!calendars.length) throw new Error('No configured Google calendar is accessible')
  const sortKey = (event: CalendarEvent) => 'date' in event.start ? event.start.date : event.start.dateTime
  return { calendars, events: [...events.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b))) }
}

export async function createAgendaEvent(env: NodeJS.ProcessEnv, calendarId: string, title: string, start: string, end: string) {
  const rawId = calendarIds(env).find(id => hash(id) === calendarId)
  if (!rawId) throw new Error('Unknown configured Google calendar')
  const token = await googleAccessToken(env)
  const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(rawId) + '/events'
  const event = await json<GoogleEvent>(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: title,
      start: { dateTime: start + ':00', timeZone: 'Europe/Paris' },
      end: { dateTime: end + ':00', timeZone: 'Europe/Paris' },
    }),
  })
  calendarCache.until = 0
  return { id: hash(event.id + '|' + start) }
}

type Forecast = {
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; is_day: number[] }
  daily: { time: string[]; temperature_2m_min: number[]; temperature_2m_max: number[]; weather_code: number[] }
  current: { temperature_2m: number; weather_code: number; is_day: number }
}

function condition(code: number, isDay: boolean) {
  let cond = 'rain'
  let label = 'Pluie'
  if (code === 0) { cond = 'clear'; label = isDay ? 'Ensoleillé' : 'Dégagé' }
  else if (code <= 2) { cond = 'partly'; label = 'Éclaircies' }
  else if (code === 3) { cond = 'cloudy'; label = 'Nuageux' }
  else if (code === 45 || code === 48) { cond = 'fog'; label = 'Brouillard' }
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { cond = 'snow'; label = 'Neige' }
  else if (code >= 95) { cond = 'storm'; label = 'Orage' }
  return { cond, label, isDay }
}

async function forecast(lat: string, lon: string, city: string) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,weather_code,is_day', hourly: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code', timezone: 'Europe/Paris', forecast_days: '5',
  }).toString()
  const { hourly, daily, current } = await json<Forecast>(url)
  const days = daily.time.map((date, i) => {
    const hours = hourly.time.flatMap((time, n) => {
      const hour = Number(time.slice(11, 13))
      return time.startsWith(date) && [8, 12, 16, 20].includes(hour)
        ? [{ hour, temp: hourly.temperature_2m[n], ...condition(hourly.weather_code[n], !!hourly.is_day[n]) }]
        : []
    })
    return { date, city, hours, temp: hours.find(slot => slot.hour === 12)?.temp ?? null,
      low: daily.temperature_2m_min[i], high: daily.temperature_2m_max[i], ...condition(daily.weather_code[i], true) }
  })
  return { ...days[0], ...condition(current.weather_code, !!current.is_day), temp: current.temperature_2m, days, city }
}

const primaryCache: Cache<Awaited<ReturnType<typeof forecast>>> = { until: 0 }
const auxerreCache: typeof primaryCache = { until: 0 }
export async function weather(env: NodeJS.ProcessEnv) {
  const [primary, auxerre] = await Promise.allSettled([
    cached(primaryCache, 1_800_000, () => forecast(env.WEATHER_LAT ?? '48.8566', env.WEATHER_LON ?? '2.3522', env.WEATHER_CITY ?? 'Paris')),
    cached(auxerreCache, 1_800_000, () => forecast('47.7982', '3.5738', 'Auxerre')),
  ])
  const home = primary.status === 'fulfilled' ? primary.value : primaryCache.value
  const away = auxerre.status === 'fulfilled' ? auxerre.value : auxerreCache.value
  if (!home && !away) throw new Error('Open-Meteo is unavailable')
  return { ...home, city: home?.city ?? env.WEATHER_CITY ?? 'Paris', auxerre: away }
}
