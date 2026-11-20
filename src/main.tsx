import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/geologica'
import '@glass-sdk/liquid-glass/styles.css'
import './style.css'
import './themes.css'
import './discovery.css'
import './shell.css'
import './motion.css'
import './navigation.css'
import './profile.css'
import './panel.css'
import './search.css'
import './polish.css'

const params = new URLSearchParams(location.search)
document.documentElement.dataset.theme = window.kadr?.initialTheme || 'light'
document.documentElement.dataset.motion = window.kadr?.initialMotion === false ? 'off' : 'on'
const Gold = lazy(() => import('../design/dark-hero-original'))
const SourceDemo = lazy(() => import('./SourceDemo').then(m => ({ default: m.SourceDemo })))
createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>{params.has('gold') ? <Gold /> : params.has('demo') ? <div className="demo-route"><SourceDemo /></div> : <App />}</Suspense>,
)
