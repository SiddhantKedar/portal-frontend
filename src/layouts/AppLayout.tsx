import { Outlet } from 'react-router-dom'
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppSidebar } from '@/components/app-sidebar'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import api from '@/api/axios'

export default function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />

        {/* Page content */}
        <main className="flex-1 bg-white p-6">
          <Outlet />
        </main>

      </SidebarInset>
    </SidebarProvider>
  )
}

// Topbar is its own component (rather than inline in AppLayout) purely so it
// can call useSidebar() — that hook requires a SidebarProvider ancestor, and
// AppLayout is the one rendering the provider, so the consumer has to sit below it.
function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { state, isMobile, openMobile } = useSidebar()

  // Sidebar shows its own logo whenever it's actually visible:
  //   - desktop: expanded
  //   - mobile: sheet open
  // Everywhere else (desktop collapsed, or mobile with the sheet closed —
  // its default resting state) the sidebar's logo is off-screen, so the
  // topbar shows a compact logo + wording instead.
  const sidebarShowingLogo = isMobile ? openMobile : state === 'expanded'

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
    <header className="flex h-14 items-center gap-4 border-b border-black/15 bg-white px-6">
      <SidebarTrigger className="text-black" />

      {!sidebarShowingLogo && (
        <div className="flex items-center gap-2.5">
          <div className="w-[26px] h-[26px] flex items-center justify-center shrink-0">
            <img src="/final logo-cropped.svg" alt="Enerlynx logo" className="w-full h-full object-contain" />
          </div>
          <img
            src="/Wording-dark.svg"
            alt="Enerlynx"
            className="h-[13px] w-auto object-contain"
          />
        </div>
      )}

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-9 w-9 flex items-center justify-center border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors shrink-0"
          >
            <User size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-lg border border-black/15 shadow-lg">
          <DropdownMenuLabel className="font-normal">
            <p className="text-[13px] font-semibold text-black truncate">{user?.full_name}</p>
            <p className="text-[12px] text-black/50 truncate">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-black/10" />
          <DropdownMenuItem
            onClick={() => navigate('/profile')}
            className="cursor-pointer text-[13px] font-medium text-black focus:bg-black focus:text-white rounded-md"
          >
            <User size={14} className="mr-2" />
            User page
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-[13px] font-medium text-black focus:bg-black focus:text-white rounded-md"
          >
            <LogOut size={14} className="mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}