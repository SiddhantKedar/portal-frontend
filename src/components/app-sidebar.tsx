import { LayoutDashboard, AudioWaveform, Activity, Factory, AlertTriangle, Gauge, GitMerge, LineChart, Building2, CloudSun, ArrowLeft } from 'lucide-react'
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

const NAV_ACTIVE =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-600 text-white font-medium'
const NAV_INACTIVE =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg !text-gray-300 hover:bg-amber-600/10 hover:!text-amber-600 transition-colors'

const SUB_ACTIVE = 'text-[12px] font-medium'
const SUB_INACTIVE = 'text-[12px]'

export function AppSidebar() {
  const { site, devices, selectableSites } = useSite()
  const { user } = useAuth()
  const { setOpenMobile, isMobile } = useSidebar()

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  // Multi-site users can climb back out to the portfolio; single-site users have
  // nowhere to go, so the link would be a dead end.
  const showPortfolioLink = selectableSites.length > 1

  const inverters = devices
    .filter((d) => d.device_type === 'INVERTER' && d.is_active)
    .sort((a, b) =>
      a.influx_device_id.localeCompare(b.influx_device_id, undefined, { numeric: true })
    )

  const hasMeters = devices.some((d) => d.device_type === 'METER' && d.is_active)

  // Every monitoring route hangs off the active site. On site-less routes
  // (/portfolio, /profile) `base` is null and the Monitor group is suppressed —
  // those links have no site to point at.
  const base = site ? `/sites/${site.id}` : null

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

      <SidebarContent>

        {/* Portfolio / back-out */}
        {showPortfolioLink && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/portfolio"
                      onClick={closeOnMobile}
                      className={({ isActive }) => (isActive ? NAV_ACTIVE : NAV_INACTIVE)}
                    >
                      {site ? <ArrowLeft size={16} /> : <Building2 size={16} />}
                      <span className="text-[13px]">{site ? 'All Sites' : 'Portfolio'}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Active site name — orients the user once nav is site-relative */}
        {site && (
          <div className="px-4 pb-1">
            <p className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">
              Current Site
            </p>
            <p className="text-[13px] font-medium text-white truncate mt-0.5">{site.name}</p>
            <p className="text-[11px] text-gray-400 truncate">{site.customer_name}</p>
          </div>
        )}

        {base && (
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
                      to={`${base}/plant`}
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
                            to={`${base}/inverters`}
                            end
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
                                  to={`${base}/inverters/${inv.influx_device_id}`}
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
                      to={`${base}/scb`}
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
                        to={`${base}/meter`}
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
                      to={`${base}/analytics`}
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
                      to={`${base}/weather`}
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
                      to={`${base}/health`}
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
                      to={`${base}/alerts`}
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
        )}

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