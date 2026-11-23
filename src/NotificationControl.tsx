import { useEffect, useState } from 'react'

type State = 'checking' | 'unsupported' | 'off' | 'loading' | 'on' | 'error'

function decodeKey(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function api<T>(body: object): Promise<T> {
  const response = await fetch('/api/dashboard', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'Connecte-toi puis réessaie.' : 'Impossible de configurer les notifications.')
  return response.json() as Promise<T>
}

export function NotificationControl() {
  const [state, setState] = useState<State>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported'); return
    }
    void navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription())
      .then(subscription => setState(subscription ? 'on' : 'off'))
      .catch(() => setState('error'))
  }, [])

  async function toggle() {
    setState('loading'); setMessage('')
    try {
      const registration = await navigator.serviceWorker.ready
      const current = await registration.pushManager.getSubscription()
      if (current) {
        await api({ a: 'pushUnsubscribe', endpoint: current.endpoint })
        await current.unsubscribe()
        setState('off'); setMessage('Notifications désactivées sur cet appareil.')
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Autorisation refusée dans les réglages du téléphone.')
      const { publicKey } = await api<{ publicKey: string }>({ a: 'pushPublicKey' })
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeKey(publicKey),
      })
      try {
        await api({ a: 'pushSubscribe', subscription: subscription.toJSON() })
      } catch (error) {
        await subscription.unsubscribe()
        throw error
      }
      setState('on'); setMessage('Notifications activées. Le test vient d’être envoyé.')
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.')
    }
  }

  if (state === 'checking' || state === 'unsupported') return null
  const enabled = state === 'on'
  return <div className="push-control">
    <button className={'push-button' + (enabled ? ' active' : '')} type="button" onClick={toggle}
      disabled={state === 'loading'} aria-pressed={enabled}
      aria-label={enabled ? 'Désactiver les notifications' : 'Activer les notifications'}
      title={enabled ? 'Notifications activées' : 'Activer les notifications'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    </button>
    {message && <div className={'push-message' + (state === 'error' ? ' error' : '')} role="status">{message}</div>}
  </div>
}
