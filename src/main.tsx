import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SiteProvider } from '@/context/SiteContext'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SiteProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </SiteProvider>
    </AuthProvider>
  </StrictMode>
)