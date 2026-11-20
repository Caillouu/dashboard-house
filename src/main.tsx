import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { DashboardShell } from './DashboardShell.tsx'
import './shell.css'

const root = createRoot(document.getElementById('dashboard-root')!)
flushSync(() => root.render(<DashboardShell />))
void import('../app.js')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker', error))
}
