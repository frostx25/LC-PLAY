import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './legacy-tv.css'

// Grid gap is supported before flex gap; CSS.supports('gap') cannot distinguish them.
const gapProbe = document.createElement('div')
gapProbe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px'
gapProbe.append(document.createElement('div'), document.createElement('div'))
document.body.appendChild(gapProbe)
document.documentElement.classList.toggle('no-flex-gap', gapProbe.scrollHeight !== 1)
gapProbe.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
