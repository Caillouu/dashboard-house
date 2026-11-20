import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { APIError } from './transport.ts'
import { randomMascot } from './mascot.ts'

type Member = 'p1' | 'p2'
type LoginState = { open: boolean; message: string }
type Rejected = { operationId: string; label: string }
type SyncState = { text: string; rejected: Rejected[] }

const dashboardRoot = document.getElementById('dashboard-root')!
const loginRoot = createRoot(document.getElementById('login')!)
const syncRoot = createRoot(document.getElementById('sync-controls')!)
const loginMascot = randomMascot()

type Commands = {
  login(member: Member, code: string): Promise<void>
  resolve(operationId: string, retry: boolean): void
}
let commands: Commands

export function setupControls(next: Commands) { commands = next }
export function showLogin(message: string) {
  dashboardRoot.inert = true
  loginRoot.render(<Login open message={message} />)
}
export function hideLogin() {
  dashboardRoot.inert = false
  loginRoot.render(null)
}
export function showSync(next: SyncState) {
  syncRoot.render(<SyncNotice {...next} />)
}

function Login({ open, message }: LoginState) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const codeInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) codeInput.current?.focus() }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const fields = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      await commands.login(fields.get('member') as Member, String(fields.get('code')))
    } catch (err) {
      const code = err instanceof APIError ? err.code : ''
      setError(code === 'auth' ? 'Code incorrect.' : code === 'locked' ? 'Trop d’essais. Réessaie dans quelques minutes.' : 'Connexion impossible. Réessaie dans un instant.')
    } finally {
      setPending(false)
    }
  }

  if (!open) return null
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src={'/' + loginMascot.image} alt="" />
        <h2>Maison</h2>
        <label htmlFor="login-member">Compte du foyer</label>
        <select className="in" id="login-member" name="member" autoComplete="username" disabled={pending}>
          <option value="p1">Pierre</option>
          <option value="p2">Justine</option>
        </select>
        <label htmlFor="login-code">Code personnel</label>
        <input ref={codeInput} className="in" id="login-code" name="code" type="password" required maxLength={200} autoComplete="current-password" disabled={pending} />
        <div className="login-err" role="alert">{error || message}</div>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Connexion…' : 'Entrer'}</button>
      </form>
    </div>
  )
}

function SyncNotice({ text, rejected }: SyncState) {
  return <>
    {text && <div className="note" role="status">{text}</div>}
    {rejected.length > 0 && <div className="note">
      <p>Modifications à vérifier</p>
      {rejected.map(op => <div key={op.operationId}>
        <span>{op.label}</span>{' '}
        <button type="button" className="lnk" onClick={() => commands.resolve(op.operationId, true)}>Renvoyer ma modification</button>{' '}
        <button type="button" className="lnk" onClick={() => commands.resolve(op.operationId, false)}>Garder la version du foyer</button>
      </div>)}
    </div>}
  </>
}

