import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const bootstrap = async () => {
  try {
    const response = await fetch('/snm-api/config', {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('Frontend configuration is unavailable')
    const config: unknown = await response.json()
    if (
      !config ||
      typeof config !== 'object' ||
      !('apiConfigured' in config) ||
      typeof config.apiConfigured !== 'boolean'
    )
      throw new Error('Invalid frontend configuration')
    window.__SNM_CONFIG__ = { apiConfigured: config.apiConfigured }
  } catch {
    document.getElementById('root')!.textContent =
      'Frontend configuration could not be loaded. Reload to retry.'
    return
  }

  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
