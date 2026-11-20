export type MascotMood = 'unknown' | 'storm' | 'rain' | 'snow' | 'fog' | 'night' | 'cloudy' | 'dusk' | 'partly' | 'sunny'

type Mascot = {
  name: 'Charlie' | 'Joey'
  image: string
  alt: string
  phrases: Record<MascotMood, string>
}

const mascots: Mascot[] = [
  {
    name: 'Charlie',
    image: 'assets/charlie.png',
    alt: 'Charlie, toute souriante',
    phrases: {
      unknown: 'Charlie guette le ciel…',
      storm: 'Boum ! Le ciel fait du bruit ⛈️',
      rain: 'Des flaques ! Vite, les bottes ☔',
      snow: 'Charlie compte les flocons ❄️',
      fog: 'Le ciel joue à cache-cache 🌫️',
      night: 'La lune veille sur Charlie 🌙',
      cloudy: 'Des nuages tout doux ☁️',
      dusk: 'Le ciel met son pyjama 🌇',
      partly: 'Coucou, soleil ! 🌤️',
      sunny: 'Charlie brille plus fort ☀️',
    },
  },
  {
    name: 'Joey',
    image: 'assets/joey.png',
    alt: 'Joey, le chat noir',
    phrases: {
      unknown: 'Joey surveille le ciel…',
      storm: 'Joey juge très fort cet orage ⛈️',
      rain: 'Pluie : Joey annule tout ☔',
      snow: 'Joey chasse les flocons ❄️',
      fog: 'Joey a perdu l’horizon 🌫️',
      night: 'La nuit ? Enfin son heure 🌙',
      cloudy: 'Nuages : sieste validée ☁️',
      dusk: 'Joey passe en mode ninja 🌇',
      partly: 'Un rayon, une sieste 🌤️',
      sunny: 'Joey recharge ses moustaches ☀️',
    },
  },
]

export const mascot = mascots[Math.floor(Math.random() * mascots.length)]

export function mascotPhrase(mood: MascotMood) {
  return mascot.phrases[mood]
}
