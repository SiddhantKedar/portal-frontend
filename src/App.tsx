import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
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
import InstallerOverviewPage from './pages/InstallerOverviewPage'
import WeatherPage from './pages/WeatherPage'
import NotFoundPage from './pages/NotFoundPage'
import UserPage from './pages/UserPage'

// Test pages
import CustomerOverviewPage from './pages/TEMP-CustomerOverviewPage'
import PlantOverviewPage1 from './pages/TEMP1-PlantOverviewPage'
import EnergyFlowPage from './pages/EnergyFlowPage'

function PrivateRoute() {
  const { user, isLoading } = useAuth()
  const { siteLoading, siteError } = useSite()

  if (isLoading || siteLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <p className="text-[13px] text-gray-400">Loading...</p>
      </div>
    )
  }

  if (siteError) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <p className="text-[13px] text-red-400">{siteError}</p>
      </div>
    )
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />
}


function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'INSTALLER' ? '/installer' : '/plant'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/plant" element={<PlantOverviewPage />} />
            <Route path="/inverters" element={<InverterOverviewPage />} />
            <Route path="/inverters/:deviceId" element={<InverterDetailPage />} />
            <Route path="/scb" element={<ScbPage />} />
            <Route path="/meter" element={<MeterOverviewPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/installer" element={<InstallerOverviewPage />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route path="/profile" element={<UserPage />} />
            <Route path="*" element={<NotFoundPage />} />

            <Route path="/customers/:customerId" element={<CustomerOverviewPage />} />
            <Route path="/plant1" element={<PlantOverviewPage1 />} />
            <Route path="/energy-flow" element={<EnergyFlowPage />} />

            
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}