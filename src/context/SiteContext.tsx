import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import api from '@/api/axios'
import { useAuth } from '@/context/AuthContext'

// ---- Types ----

export interface Site {
  id: number
  name: string
  site_type: string
  location: string
  influx_site_id: string
  customer_name: string
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
  site: Site | null
  devices: SiteDevice[]
  siteLoading: boolean
  siteError: string | null
}

const SiteContext = createContext<SiteContextType | null>(null)

export function SiteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [site, setSite] = useState<Site | null>(null)
  const [devices, setDevices] = useState<SiteDevice[]>([])
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setSiteLoading(false)
      return
    }
    fetchSite()
  }, [user])

  const fetchSite = async () => {
    setSiteLoading(true)
    setSiteError(null)

    try {
      let customerId: number | null = null

      if (user?.role === 'CUSTOMER') {
        // Customer has direct customer ID on their user object
        customerId = user.customer_id
      } else {
        // ADMIN or INSTALLER — fetch first customer
        const customersRes = await api.get<{ id: number }[]>('/customers/')
        if (!customersRes.data.length) {
          setSiteError('No customers found.')
          return
        }
        customerId = customersRes.data[0].id
      }

      // Fetch sites for this customer, filter by GENERATION
      const sitesRes = await api.get<Site[]>(`/sites/?customer=${customerId}`)
      const generationSite = sitesRes.data.find(
        (s) => s.site_type === 'GENERATION' && s.is_active
      )

      if (!generationSite) {
        setSiteError('No active generation site found.')
        return
      }

      setSite(generationSite)

      // Fetch devices for this site to build sidebar
      const devicesRes = await api.get<{ devices: SiteDevice[] }>(
        `/sites/${generationSite.id}/`
      )
      setDevices(devicesRes.data.devices)

    } catch (err) {
      setSiteError('Failed to load site data.')
    } finally {
      setSiteLoading(false)
    }
  }

  return (
    <SiteContext.Provider value={{ site, devices, siteLoading, siteError }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const context = useContext(SiteContext)
  if (!context) throw new Error('useSite must be used inside SiteProvider')
  return context
}