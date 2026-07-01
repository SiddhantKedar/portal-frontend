import { LayoutDashboard, Zap, AudioWaveform, Activity, Factory, AlertTriangle, Gauge, GitMerge, LineChart } from 'lucide-react'
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
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { useSite } from '@/context/SiteContext'
import { useAuth } from '@/context/AuthContext'

export function AppSidebar() {
  const { site, devices } = useSite()
  const { user } = useAuth()

  const inverters = devices
    .filter((d) => d.device_type === 'INVERTER' && d.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))

  const hasMeters = devices.some((d) => d.device_type === 'METER' && d.is_active)

  return (
    <Sidebar>

      {/* Logo */}
      <SidebarHeader className="border-b border-[#E2E8F0] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] bg-[#0F1E3C] rounded-lg flex items-center justify-center">
            <Zap size={15} className="text-[#22C55E]" />
          </div>
          <div>
            <span className="text-[15px] font-semibold text-[#0F1E3C] tracking-tight block">
              Enerlynx
            </span>
            {site && (
              <span className="text-[11px] text-gray-400 block truncate max-w-[140px]">
                {site.name}
              </span>
            )}
          </div>
        </div>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-gray-400">
            Monitor
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>

              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                        : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                    }
                  >
                    <LayoutDashboard size={16} />
                    <span className="text-[13px]">Dashboard</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Plant Overview */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/plant"
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                        : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                    }
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
                          className={({ isActive }) =>
                            isActive
                              ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium'
                              : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                          }
                        >
                          <AudioWaveform size={16} />
                          <span className="text-[13px] font-medium">Inverter Overview</span>
                        </NavLink>
                      </SidebarMenuButton>

                      <CollapsibleTrigger asChild>
                        <button className="ml-auto p-1 text-gray-400 hover:text-[#0F1E3C]">
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
                                className={({ isActive }) =>
                                  isActive
                                    ? 'text-[12px] text-[#0F1E3C] font-medium'
                                    : 'text-[12px] text-gray-400 hover:text-[#0F1E3C]'
                                }
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
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                        : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                    }
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
                      className={({ isActive }) =>
                        isActive
                          ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                          : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                      }
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
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                        : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                    }
                  >
                    <LineChart size={16} />
                    <span className="text-[13px]">Analytics</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>


              {/* System Health */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/health"
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                        : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                    }
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
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium '
                        : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                    }
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
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-gray-400">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/users"
                      className={({ isActive }) =>
                        isActive
                          ? 'flex items-center gap-2.5 text-[#0F1E3C] font-medium bg-[#F4F6F9] rounded-lg'
                          : 'flex items-center gap-2.5 text-gray-500 hover:text-[#0F1E3C]'
                      }
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
      <SidebarFooter className="border-t border-[#E2E8F0] px-4 py-3">
        <div>
          <p className="text-[12px] font-medium text-[#0F1E3C]">{user?.full_name}</p>
          <p className="text-[11px] text-gray-400">{user?.role}</p>
        </div>
      </SidebarFooter>

    </Sidebar>
  )
}