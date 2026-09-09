import type { AxiosResponse } from 'axios'
import { DEMO_SITES, DEMO_SCOPE_NAME, isDemoUser } from '@/config/demo'

// Read the logged-in user straight from localStorage (same source AuthContext
// restores from) so this works outside React.
function activeDemoUser(): boolean {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return false
    return isDemoUser(JSON.parse(raw)?.email)
  } catch {
    return false
  }
}

const maskById = new Map(DEMO_SITES.map((m) => [m.siteId, m]))

// Overview endpoints pass the site id as a query param (?site=<id>).
function siteIdFromUrl(url?: string): number | null {
  if (!url) return null
  const m = url.match(/[?&]site=(\d+)/)
  return m ? Number(m[1]) : null
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

// ---- /sites/ → Site[] : filter to allowlist + rename ----
function maskSitesList(data: unknown[]): unknown[] {
  return data
    .filter((s) => maskById.has((s as { id: number }).id))
    .map((s) => {
      const site = s as Record<string, unknown>
      const mask = maskById.get(site.id as number)!
        return { ...site, name: mask.siteName, customer_name: mask.customerName, installer_name: null }
    })
}

// ---- /influx/portfolio/overview/ : filter, regroup into A/B, recompute summary ----
const STATE_KEYS = ['running', 'stopped', 'standby', 'warning', 'fault', 'other'] as const

function recomputeSummary(sites: Record<string, any>[], prev: Record<string, unknown>) {
  const states: Record<string, number> = { running: 0, stopped: 0, standby: 0, warning: 0, fault: 0, other: 0 }
  let power = 0, energy = 0, anyEnergy = false, acCap = 0, online = 0, invOn = 0, invTot = 0

  for (const s of sites) {
    power += num(s.active_power_kw)
    if (s.energy_today_kwh != null) { anyEnergy = true; energy += num(s.energy_today_kwh) }
    acCap += num(s.ac_capacity_kw)
    if (s.logger_online) online += 1
    invOn += num(s.inverters_online)
    invTot += num(s.inverters_total)
    for (const k of STATE_KEYS) states[k] += num(s.states?.[k])
  }

  return {
    ...prev,
    total_active_power_kw: Math.round(power * 100) / 100,
    total_energy_today_kwh: anyEnergy ? energy : null,
    ac_capacity_kw: acCap,
    sites_online: online,
    sites_total: sites.length,
    inverters_online: invOn,
    inverters_total: invTot,
    loggers_online: online,
    loggers_total: sites.length,
    states,
  }
}

function maskPortfolio(data: Record<string, any>) {
  // flatten real customers → keep allowlisted sites, renamed
  const kept = new Map<number, Record<string, any>>()
  for (const cust of data.customers ?? []) {
    for (const site of cust.sites ?? []) {
      const mask = maskById.get(site.site_id)
        if (mask) kept.set(site.site_id, { ...site, site_name: mask.siteName, installer_name: null })
    }
  }

  // regroup into synthetic demo customers, preserving DEMO_SITES order
  const order: number[] = []
  const groups = new Map<number, { customer_id: number; customer_name: string; sites: any[] }>()
  for (const mask of DEMO_SITES) {
    const site = kept.get(mask.siteId)
    if (!site) continue
    if (!groups.has(mask.customerId)) {
      groups.set(mask.customerId, { customer_id: mask.customerId, customer_name: mask.customerName, sites: [] })
      order.push(mask.customerId)
    }
    groups.get(mask.customerId)!.sites.push(site)
  }

  const customers = order.map((id) => groups.get(id)!)
  const flat = customers.flatMap((c) => c.sites)

  return {
    ...data,
    scope_name: DEMO_SCOPE_NAME,
    customers,
    portfolio_summary: recomputeSummary(flat, data.portfolio_summary ?? {}),
  }
}

// ---- /influx/…?site=<id> : rename site/customer fields in the body ----
function maskOverview(data: Record<string, unknown>, siteId: number) {
  const mask = maskById.get(siteId)
  if (!mask || !data || typeof data !== 'object') return data
  const out = { ...data }
  if ('site' in out) out.site = mask.siteName
  if ('customer' in out) out.customer = mask.customerName
  return out
}

// ---- entry point, called from the axios response interceptor ----
export function applyDemoMask(response: AxiosResponse): AxiosResponse {
  if (!activeDemoUser()) return response
  const url = response.config?.url ?? ''

  if (url.includes('/influx/portfolio/overview/')) {
    response.data = maskPortfolio(response.data)
    return response
  }

  if (url.includes('/sites/') && Array.isArray(response.data)) {
    response.data = maskSitesList(response.data)
    return response
  }

  const siteId = siteIdFromUrl(url)
  if (siteId != null && url.includes('/influx/')) {
    // A demo user hitting a site outside the allowlist (e.g. hand-typed URL):
    // refuse rather than render real data under any name.
    if (!maskById.has(siteId)) throw new Error('site-not-in-demo-allowlist')
    response.data = maskOverview(response.data, siteId)
    return response
  }

  return response
}