import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { SiteProvider } from '@/context/SiteContext'
import App from './App.tsx'
import './index.css'

// BrowserRouter must sit ABOVE SiteProvider — SiteContext reads the active site
// from the URL via useMatch(), which requires a Router ancestor.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SiteProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </SiteProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)