import { writeFileSync } from 'node:fs'
import { commands } from './index.mjs'

const intent = (name, slot, type, samples) => ({ name, slots: [{ name: slot, type }], samples })
const model = {
  interactionModel: {
    languageModel: {
      invocationName: 'maison au quotidien',
      intents: [
        ...Object.entries(commands).map(([name, [, samples]]) => intent(name, 'titre', 'AMAZON.SearchQuery', samples)),
        intent('Dictee', 'valeur', 'AMAZON.SearchQuery', ['écris {valeur}', 'le nom est {valeur}', 'note {valeur}']),
        intent('DateValeur', 'valeur', 'AMAZON.DATE', ['le {valeur}', 'c’est le {valeur}']),
        intent('HeureValeur', 'valeur', 'AMAZON.TIME', ['à {valeur}', 'il est {valeur}']),
        intent('EurosValeur', 'valeur', 'AMAZON.NUMBER', ['{valeur} euros', '{valeur} euro']),
        intent('CentimesValeur', 'valeur', 'AMAZON.NUMBER', ['{valeur} centimes', '{valeur} centime']),
        intent('MembreValeur', 'valeur', 'MembreDuFoyer', ['{valeur}', 'payé par le {valeur}']),
        { name: 'Passer', samples: ['passer', 'passe', 'sans préciser'] },
        ...['Cancel', 'Stop', 'Help', 'Yes', 'No', 'Fallback'].map(name => ({ name: 'AMAZON.' + name + 'Intent' })),
      ],
      types: [{
        name: 'MembreDuFoyer',
        values: [
          { id: 'p1', name: { value: 'premier membre', synonyms: ['membre un'] } },
          { id: 'p2', name: { value: 'deuxième membre', synonyms: ['membre deux', 'second membre'] } },
        ],
      }],
    },
  },
}

writeFileSync(new URL('./fr-FR.json', import.meta.url), JSON.stringify(model, null, 2) + '\n')
