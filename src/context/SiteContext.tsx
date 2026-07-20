import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMatch } from 'react-router-dom'
import api from '@/api/axios'
import { useAuth } from '@/context/AuthContext'

// ---- Types ----

export interface Site {
  id: number
  name: string
  site_type: 'GENERATION' | 'SUBSTATION' | 'OTHER'
  parent_site: number | null
  location: string
  influx_site_id: string
  dc_capacity_kw: string | null   // DRF DecimalField → string over the wire
  ac_capacity_kw: string | null
  daily_generation_target_kwh: string | null
  customer_name: string
  installer_name: string | null
  is_active: boolean
}

export interface SiteDevice {
  id: number
  name: string
  device_type: string
  influx_device_id: string
  is_active: boolean
}

interface SiteContextType {
  /** Every site the user can see, including SUBSTATION rows. */
  allSites: Site[]
  /** Sites a user can actually navigate to — GENERATION + active. */
  selectableSites: Site[]
  /** The site named by the URL, or null on site-less routes. */
  site: Site | null
  devices: SiteDevice[]
  /** One-time session load of the site list. Blocks the app. */
  bootstrapLoading: boolean
  bootstrapError: string | null
  /** Per-site device load. Page-level skeleton only — never blocks the app. */
  devicesLoading: boolean
  refreshSites: () => Promise<void>
}

const SiteContext = createContext<SiteContextType | null>(null)

export function SiteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [allSites, setAllSites] = useState<Site[]>([])
  const [devices, setDevices] = useState<SiteDevice[]>([])
  const [bootstrapLoading, setBootstrapLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [devicesLoading, setDevicesLoading] = useState(false)

  // useMatch, not useParams — params only populate inside a matched <Route>,
  // and this provider sits above <Routes>.
  const match = useMatch('/sites/:siteId/*')
  const siteIdParam = match?.params.siteId ?? null

  const selectableSites = useMemo(
    () => allSites.filter((s) => s.site_type === 'GENERATION' && s.is_active),
    [allSites],
  )

  // Resolved against allSites, not selectableSites — a substation reached by
  // direct URL should resolve rather than 404, even though it's never offered
  // as a destination.
  const site = useMemo(
    () => (siteIdParam ? allSites.find((s) => String(s.id) === siteIdParam) ?? null : null),
    [allSites, siteIdParam],
  )

  const refreshSites = useCallback(async () => {
    setBootstrapLoading(true)
    setBootstrapError(null)
    try {
      // /sites/ is already tenant-filtered server-side, and carries customer_name
      // and installer_name — no /customers/ round-trip needed.
      const res = await api.get<Site[]>('/sites/')
      setAllSites(res.data)
    } catch {
      setBootstrapError('Failed to load sites.')
      setAllSites([])
    } finally {
      setBootstrapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setAllSites([])
      setDevices([])
      setBootstrapError(null)
      setBootstrapLoading(false)
      return
    }
    refreshSites()
  }, [user, refreshSites])

  // Devices follow the resolved site. `cancelled` guards against a slow response
  // for the previous site landing after a switch.
  useEffect(() => {
    if (!site) {
      setDevices([])
      setDevicesLoading(false)
      return
    }
    let cancelled = false
    setDevicesLoading(true)
    api
      .get<{ devices: SiteDevice[] }>(`/sites/${site.id}/`)
      .then((res) => { if (!cancelled) setDevices(res.data.devices ?? []) })
      .catch(() => { if (!cancelled) setDevices([]) })
      .finally(() => { if (!cancelled) setDevicesLoading(false) })
    return () => { cancelled = true }
  }, [site?.id])

  return (
    <SiteContext.Provider
      value={{
        allSites,
        selectableSites,
        site,
        devices,
        bootstrapLoading,
        bootstrapError,
        devicesLoading,
        refreshSites,
      }}
    >
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const context = useContext(SiteContext)
  if (!context) throw new Error('useSite must be used inside SiteProvider')
  return context
}