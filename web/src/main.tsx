import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { AuthProvider } from '@media-compress/auth-client-web'

import { App } from './App'
import { I18nProvider } from './i18n'
import './index.css'

// Optional login. Unset → local single-user mode. Set VITE_SSO_BASE=/auth (in
// web/.env.local or at build time) when a reverse proxy routes /auth/* to the
// companion feishu-sso service on the same origin; the api must then set
// WHOAMI_URL too.
const ssoBase = (import.meta.env.VITE_SSO_BASE as string | undefined) || undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
    <AuthProvider config={{ ssoBase }}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
)
