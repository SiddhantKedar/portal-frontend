import { LayoutDashboard, AudioWaveform, Activity, Factory, AlertTriangle, Gauge, GitMerge, LineChart, Building2, CloudSun } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { useSite } from '@/context/SiteContext'
import { useAuth } from '@/context/AuthContext'

// Shared nav link styling — black sidebar, white body text, amber-600 for
// the active item's pill background and for hover state text/tint.
const NAV_ACTIVE =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-600 text-white font-medium'
const NAV_INACTIVE =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg !text-gray-300 hover:bg-amber-600/10 hover:!text-amber-600 transition-colors'

// Sub-items (inverter list) use !text overrides — SidebarMenuSubButton's
// own base styles otherwise win the specificity fight and render black.
const SUB_ACTIVE = 'text-[12px] font-medium'
const SUB_INACTIVE = 'text-[12px]'

export function AppSidebar() {
  const { devices } = useSite()
  const { user } = useAuth()
  const { setOpenMobile, isMobile } = useSidebar()

  // Close the sidebar on nav click, but only on mobile — desktop stays pinned open.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  const inverters = devices
    .filter((d) => d.device_type === 'INVERTER' && d.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))

  const hasMeters = devices.some((d) => d.device_type === 'METER' && d.is_active)

  return (
    <Sidebar className="bg-black border-r border-white/10 text-white [&_[data-sidebar=sidebar]]:bg-black">

      {/* Logo */}
      <SidebarHeader className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0">
            <img src="/final logo dark-cropped.svg" alt="Enerlynx logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <img
        src="/Wording-white.svg"
        alt="Enerlynx"
        className="h-[15px] w-auto object-contain"
      />
          </div>
        </div>
      </SidebarHeader>

      {/* Nav */}

       {/* Installer only section */}
        {user?.role === 'INSTALLER' && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">
              Installer
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/installer"
                      onClick={closeOnMobile}
                      className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                    >
                      <Building2 size={16} />
                      <span className="text-[13px]">Fleet Overview</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">
            Monitor
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>

              {/* Plant Overview */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/plant"
                    onClick={closeOnMobile}
                    className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                  >
                    <Factory size={16} />
                    <span className="text-[13px]">Plant Overview</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Inverter Overview + sub items */}
              <SidebarMenu>
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarMenuItem>
                    <div className="flex items-center w-full">
                      <SidebarMenuButton asChild className="flex-1">
                        <NavLink
                          to="/inverters"
                          onClick={closeOnMobile}
                          className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                        >
                          <AudioWaveform size={16} />
                          <span className="text-[13px] font-medium">Inverter Overview</span>
                        </NavLink>
                      </SidebarMenuButton>

                      <CollapsibleTrigger asChild>
                        <button className="ml-auto p-1 text-gray-400 hover:text-amber-600">
                          <ChevronRight
                            size={14}
                            className="transition-transform group-data-[state=open]/collapsible:rotate-90"
                          />
                        </button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {inverters.map((inv) => (
                          <SidebarMenuSubItem key={inv.id}>
                            <SidebarMenuSubButton asChild>
                              <NavLink
                                to={`/inverters/${inv.influx_device_id}`}
                                onClick={closeOnMobile}
                                className={({ isActive }) => (isActive ? SUB_ACTIVE : SUB_INACTIVE)}
                              >
                                {inv.name}
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>

              {/* SCB — String Combiner Box */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/scb"
                    onClick={closeOnMobile}
                    className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                  >
                    <GitMerge size={16} />
                    <span className="text-[13px]">SCB</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Meter Overview — only if meters exist */}
              {hasMeters && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/meter"
                      onClick={closeOnMobile}
                      className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                    >
                      <Gauge size={16} />
                      <span className="text-[13px]">Meter Overview</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Analytics */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/analytics"
                    onClick={closeOnMobile}
                    className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                  >
                    <LineChart size={16} />
                    <span className="text-[13px]">Analytics</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Weather */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/weather"
                    onClick={closeOnMobile}
                    className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                  >
                    <CloudSun size={16} />
                    <span className="text-[13px]">Weather</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>


              {/* System Health */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/health"
                    onClick={closeOnMobile}
                    className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                  >
                    <Activity size={16} />
                    <span className="text-[13px]">System Health</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Fault Alerts */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/alerts"
                    onClick={closeOnMobile}
                    className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                  >
                    <AlertTriangle size={16} />
                    <span className="text-[13px]">Fault Alerts</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


       
        {/* Admin only section */}
        {user?.role === 'ADMIN' && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/users"
                      onClick={closeOnMobile}
                      className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                    >
                      <LayoutDashboard size={16} />
                      <span className="text-[13px]">Users</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-white/10 px-4 py-3">
        <div>
          <p className="text-[12px] font-medium text-white">{user?.full_name}</p>
          <p className="text-[11px] text-gray-400">{user?.role}</p>
        </div>
      </SidebarFooter>

    </Sidebar>
  )
}