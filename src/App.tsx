import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { Fragment } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSite } from '@/context/SiteContext'
import LoginPage from './pages/LoginPage'
import PlantOverviewPage from './pages/PlantOverviewPage'
import InverterOverviewPage from './pages/InverterOverviewPage'
import InverterDetailPage from './pages/InverterDetailPage'
import ScbPage from './pages/StringCombinerBoxPage'
import AppLayout from './layouts/AppLayout'
import MeterOverviewPage from './pages/MeterOverviewPage'
import AnalyticsPage from './pages/AnalyticsPage'
import PortfolioPage from './pages/PortfolioPage'
import WeatherPage from './pages/WeatherPage'
import NotFoundPage from './pages/NotFoundPage'
import UserPage from './pages/UserPage'
import EnergyFlowPage from './pages/EnergyFlowPage'

function CenteredMessage({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' }) {
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
      <p className={`text-[13px] ${tone === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{text}</p>
    </div>
  )
}

// Gates on auth + the one-time site list load. Device loading is NOT gated here —
// it's per-site and would flash a full-screen loader on every site switch.
function PrivateRoute() {
  const { user, isLoading } = useAuth()
  const { bootstrapLoading, bootstrapError } = useSite()

  if (isLoading || bootstrapLoading) return <CenteredMessage text="Loading..." />
  if (!user) return <Navigate to="/login" replace />
  if (bootstrapError) return <CenteredMessage text={bootstrapError} tone="error" />

  return <Outlet />
}

// Where you land is a function of how many sites you have, not your role.
function HomeResolver() {
  const { selectableSites } = useSite()

  if (selectableSites.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-[13px] text-black/50">
          No sites have been assigned to your account yet.
        </p>
      </div>
    )
  }
  if (selectableSites.length === 1) {
    return <Navigate to={`/sites/${selectableSites[0].id}/plant`} replace />
  }
  return <Navigate to="/portfolio" replace />
}

// Guards every site-scoped route, and forces a full remount on site change.
// Without the key, /sites/7/plant → /sites/5/plant matches the same element and
// React keeps the old page's state — including in-flight useAutoRefresh fetches.
function SiteScope() {
  const { site } = useSite()

  // Bootstrap is finished by the time we render (PrivateRoute gates it), so an
  // unresolved id means the site genuinely isn't visible to this user.
  if (!site) return <Navigate to="/" replace />

  return (
    <Fragment key={site.id}>
      <Outlet />
    </Fragment>
  )
}

// Bounces stale device URLs left over from a site switch.
function DeviceScope() {
  const { deviceId } = useParams()
  const { site, devices, devicesLoading } = useSite()

  if (devicesLoading) return null
  const exists = devices.some((d) => d.influx_device_id === deviceId)
  if (!exists) return <Navigate to={`/sites/${site!.id}/inverters`} replace />

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route element={<AppLayout />}>
          {/* Site-less routes */}
          <Route path="/" element={<HomeResolver />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/profile" element={<UserPage />} />

          {/* Site-scoped routes */}
          <Route path="/sites/:siteId" element={<SiteScope />}>
            <Route index element={<Navigate to="plant" replace />} />
            <Route path="plant" element={<PlantOverviewPage />} />
            <Route path="inverters" element={<InverterOverviewPage />} />
            <Route element={<DeviceScope />}>
              <Route path="inverters/:deviceId" element={<InverterDetailPage />} />
            </Route>
            <Route path="scb" element={<ScbPage />} />
            <Route path="meter" element={<MeterOverviewPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="weather" element={<WeatherPage />} />
            <Route path="energy-flow" element={<EnergyFlowPage />} />
          </Route>

          {/* Legacy paths — remove once nothing links to them */}
          <Route path="/plant" element={<Navigate to="/" replace />} />
          <Route path="/installer" element={<Navigate to="/portfolio" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}