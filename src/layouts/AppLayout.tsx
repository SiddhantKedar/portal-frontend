import { Outlet } from 'react-router-dom'
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import api from '@/api/axios'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      const refresh = localStorage.getItem('refresh_token')
      await api.post('/auth/logout/', { refresh })
    } catch {
      // proceed regardless
    } finally {
      logout()
      navigate('/login')
    }
  }
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>

        {/* Topbar */}
        <header className="flex h-14 items-center gap-4 border-b border-[#E2E8F0] bg-white px-6">
          <SidebarTrigger className="text-gray-400 hover:text-[#0F1E3C]" />
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-gray-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-[#0F1E3C] border border-[#E2E8F0] rounded-lg px-3 py-1.5 transition-colors"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 bg-[#F4F6F9] p-6">
          <Outlet />
        </main>

      </SidebarInset>
    </SidebarProvider>
  )
}