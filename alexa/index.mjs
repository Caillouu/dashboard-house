import { createHash, randomUUID } from 'node:crypto'

const title = ['title', 'Quel nom veux-tu donner ?', 'text']
const parent = (what) => ['parent', 'Quel est le nom ' + what + ' ?', 'text']
const date = ['date', 'Quelle date ? Dis par exemple, le quinze février.', 'date']
const endDate = ['endDate', 'Quelle date de fin ? Dis le suivi de la date, ou passer pour le même jour.', 'date', true]
const tripParent = parent('du voyage')
const templateParent = parent('de la liste type')

export const commands = {
  Course: ['un article dans les courses', ['ajoute {titre} aux courses', 'mets {titre} sur la liste des courses'], { kind: 'course' }, [
    title, ['quantity', 'Quelle quantité ? Dis par exemple, écris deux bouteilles, ou dis passer.', 'text', true],
  ]],
  Wish: ['une envie dans la wishlist', ['ajoute {titre} à la wishlist', 'ajoute {titre} aux envies'], { kind: 'wish' }, [title]],
  Group: ['un groupe de routines', ['crée le groupe de routines {titre}', 'ajoute un groupe de routines {titre}'], { kind: 'group' }, [title]],
  Routine: ['une tâche de routine', ['ajoute la tâche de routine {titre}'], { kind: 'routine' }, [title, parent('du groupe de routines')]],
  Quest: ['une quête partagée', ['ajoute la quête {titre}', 'crée la quête {titre}'], { kind: 'quest', private: false }, [title]],
  PrivateQuest: ['une quête privée', ['ajoute la quête privée {titre}', 'crée la quête privée {titre}'], { kind: 'quest', private: true }, [title]],
  Step: ['une étape de quête', ['ajoute une étape de quête {titre}', 'ajoute la mini quête {titre}'], { kind: 'step' }, [title, parent('de la quête')]],
  Debt: ['une dépense à partager', ['ajoute la dépense {titre}', 'ajoute une dette pour {titre}'], { kind: 'debt' }, [
    title, ['payer', 'Qui a payé ? Dis premier membre ou deuxième membre.', 'payer'],
    ['euros', 'Combien d’euros entiers ? Dis par exemple, douze euros.', 'euros'],
    ['cents', 'Combien de centimes ? Dis passer s’il n’y en a pas.', 'cents', true],
  ]],
  Trip: ['un voyage', ['ajoute le voyage {titre}', 'crée le voyage {titre}'], { kind: 'trip' }, [
    title, ['date', 'Quand commence le voyage ? Dis le suivi de la date, ou passer.', 'date', true], endDate,
  ]],
  Activity: ['une activité de voyage', ['ajoute l’activité {titre}'], { kind: 'tripItem', type: 'Activité' }, [title, tripParent]],
  Lodging: ['un hébergement', ['ajoute l’hébergement {titre}'], { kind: 'tripItem', type: 'Hébergement' }, [title, tripParent]],
  Journey: ['un trajet de voyage', ['ajoute le trajet de voyage {titre}'], { kind: 'tripItem', type: 'Trajet' }, [title, tripParent]],
  Transport: ['un transport sur place', ['ajoute le transport sur place {titre}'], { kind: 'tripItem', type: 'Transport sur place' }, [title, tripParent]],
  Template: ['une liste type', ['crée la liste type {titre}', 'ajoute la liste type {titre}'], { kind: 'template' }, [title]],
  Pack: ['un objet dans une valise', ['mets {titre} dans la valise', 'ajoute dans la valise {titre}'], { kind: 'packing', template: false, category: false }, [title, tripParent]],
  PackCategory: ['une catégorie dans une valise', ['ajoute la catégorie de valise {titre}'], { kind: 'packing', template: false, category: true }, [title, tripParent]],
  TemplateItem: ['un objet dans une liste type', ['ajoute à une liste type {titre}'], { kind: 'packing', template: true, category: false }, [title, templateParent]],
  TemplateCategory: ['une catégorie dans une liste type', ['ajoute la catégorie de liste type {titre}'], { kind: 'packing', template: true, category: true }, [title, templateParent]],
  Event: ['un événement sur la journée', ['ajoute l’événement {titre}', 'ajoute le rendez-vous sur la journée {titre}'], { kind: 'event' }, [title, date, endDate]],
  TimedEvent: ['un rendez-vous avec horaires', ['ajoute le rendez-vous {titre}'], { kind: 'event' }, [
    title, date, ['time', 'À quelle heure commence le rendez-vous ? Dis par exemple, à dix heures.', 'time'], endDate, ['endTime', 'À quelle heure finit le rendez-vous ? Dis par exemple, à onze heures.', 'time'],
  ]],
}

const help = 'Tu peux ajouter des courses, des envies, des routines, des quêtes, des dépenses, des voyages et des rendez-vous. Par exemple, dis ajoute des pommes aux courses.'
const message = (text, state, keepOpen = Boolean(state)) => ({
  version: '1.0',
  ...(state ? { sessionAttributes: { addition: state } } : {}),
  response: {
    outputSpeech: { type: 'PlainText', text },
    ...(keepOpen ? { reprompt: { outputSpeech: { type: 'PlainText', text } } } : {}),
    shouldEndSession: !keepOpen,
  },
})

function summary(state) {
  const values = state.values
  const label = commands[state.command][0]
  const parts = [label, values.title]
  if (values.parent) parts.push('dans ' + values.parent)
  if (values.quantity) parts.push('quantité ' + values.quantity)
  if (values.payer) {
    parts.push(values.euros + ' euros et ' + (values.cents ?? 0) + ' centimes')
    parts.push('payés par le ' + (values.payer === 'p1' ? 'premier' : 'deuxième') + ' membre')
  }
  const sayDate = (value) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
  if (values.date) parts.push(sayDate(values.date) + (values.time ? ' à ' + values.time.replace(':', ' heures ') : ''))
  if (values.endDate || values.endTime) {
    parts.push('jusqu’au ' + sayDate(values.endDate ?? values.date) + (values.endTime ? ' à ' + values.endTime.replace(':', ' heures ') : ''))
  }
  return 'Je vais ajouter ' + parts.join(', ') + '. Tu confirmes ?'
}

function advance(state) {
  const fields = commands[state.command][3]
  if (state.command === 'Trip' && state.index === 2 && !state.values.date) state.index++
  return message(fields[state.index]?.[1] ?? summary(state), state)
}

function validate(type, raw, field) {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  if (type === 'text' && value && value.length <= (field === 'quantity' ? 80 : 120) && !/[\x00-\x1f]/u.test(value)) return value
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toJSON()?.slice(0, 10) === value) return value
  if (type === 'time' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value
  if (type === 'payer' && ['p1', 'p2'].includes(value)) return value
  if (['euros', 'cents'].includes(type) && /^\d+$/.test(value) && Number(value) <= (type === 'euros' ? 100000 : 99)) return Number(value)
}

const answerIntents = {
  Dictee: 'text', DateValeur: 'date', HeureValeur: 'time',
  EurosValeur: 'euros', CentimesValeur: 'cents', MembreValeur: 'payer',
}

export async function handler(event) {
  const env = process.env
  const system = event.context?.System
  if (!env.ALEXA_SKILL_ID || system?.application?.applicationId !== env.ALEXA_SKILL_ID ||
      typeof system?.user?.userId !== 'string') {
    return message('Cette demande ne provient pas du skill configuré.')
  }
  const accountHash = createHash('sha256').update(system.user.userId).digest('hex')
  if (env.ALEXA_ACCOUNT_HASH !== accountHash) {
    if (!env.ALEXA_ACCOUNT_HASH) console.info('Empreinte du compte Alexa : ' + accountHash)
    return message('Ce compte Alexa doit être associé au dashboard.')
  }
  const request = event.request
  if (request?.type === 'SessionEndedRequest') return { version: '1.0', response: {} }
  if (request?.type === 'LaunchRequest') return message(help, undefined, true)
  if (request?.type !== 'IntentRequest') return message('Ouvre le skill maison au quotidien pour ajouter un élément.')
  const { name, slots } = request.intent
  const state = event.session?.attributes?.addition
  if (['AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NoIntent'].includes(name)) return message('D’accord, ajout annulé.')
  if (name === 'AMAZON.HelpIntent') return state ? advance(state) : message(help, undefined, true)
  if (Object.hasOwn(commands, name)) {
    const value = validate('text', slots?.titre?.value, 'title')
    if (!value || (name === 'Group' && value.length > 24)) return message('Dicte un nom court, puis réessaie.', undefined, true)
    return advance({ command: name, index: 1, values: { title: value }, operationId: randomUUID() })
  }
  if (!state || !Object.hasOwn(commands, state.command)) return message(help, undefined, true)

  const [, , preset, fields] = commands[state.command]
  const field = fields[state.index]
  if (field) {
    const [key, prompt, type, optional] = field
    if (name === 'Passer' && optional) {
      state.index++
      return advance(state)
    }
    const raw = type === 'payer'
      ? slots?.valeur?.resolutions?.resolutionsPerAuthority?.flatMap(authority => authority.values ?? [])[0]?.value?.id
      : slots?.valeur?.value
    const value = answerIntents[name] === type ? validate(type, raw, key) : undefined
    if (value === undefined) return message(prompt, state)
    state.values[key] = value
    state.index++
    return advance(state)
  }
  if (name !== 'AMAZON.YesIntent') return advance(state)
  const { euros, cents, ...values } = state.values
  const action = { ...preset, ...values, ...(preset.kind === 'debt' ? { amount: euros + (cents ?? 0) / 100 } : {}) }
  try {
    const url = new URL('/api/alexa', env.DASHBOARD_HOUSE_URL)
    if (url.protocol !== 'https:' || !env.ALEXA_SKILL_SECRET) throw new Error('Configuration Alexa incomplète')
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.ALEXA_SKILL_SECRET },
      body: JSON.stringify({ operationId: state.operationId, action }),
      signal: AbortSignal.timeout(6000),
      redirect: 'error',
    })
    const payload = await result.json()
    if (result.ok && payload.ok === true) return message('C’est ajouté au dashboard.')
    const errors = {
      missing: 'Je ne trouve pas le nom indiqué dans le dashboard.',
      ambiguous: 'Plusieurs éléments portent ce nom. Renomme celui que tu veux utiliser, puis réessaie.',
      exists: 'Ce nom de routine est déjà utilisé ou réservé.',
      invalid: 'Les détails sont invalides. Vérifie le montant, les dates ou le texte, puis recommence.',
      conflict: 'Cet élément a changé pendant la commande. Recommence l’ajout.',
      calendar: 'L’agenda Alexa reste à configurer dans le dashboard.',
      auth: 'La connexion au dashboard reste à configurer.',
    }
    if (Object.hasOwn(errors, payload.error)) return message(errors[payload.error])
  } catch {
    // The same operation ID allows confirmation to be retried after a network failure.
  }
  return message('Le dashboard n’a pas confirmé l’enregistrement. Dis oui pour vérifier à nouveau.', state)
}
