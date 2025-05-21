import { createRoot } from 'react-dom/client'
import './index.scss'
import './app.css'
import App from './App.tsx'
import { SocketProvider } from './context/SocketContext.tsx'

createRoot(document.getElementById('root')!).render(
  <div>
    <SocketProvider>
    <App />
    </SocketProvider>
  </div>,
)
