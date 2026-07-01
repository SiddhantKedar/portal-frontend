import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AlertCircle, Zap } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import api from '@/api/axios'
import type { LoginResponse } from '@/types/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post<LoginResponse>('/auth/login/', {
        email,
        password,
      })
      const { access, refresh, user } = response.data
      login(access, refresh, user)
      navigate('/dashboard')
    } catch (err: any) {
      setError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        <Card className="border-[#E2E8F0] shadow-none rounded-2xl">
          <CardContent className="p-10">

            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-7">
              <div className="w-[34px] h-[34px] bg-[#0F1E3C] rounded-lg flex items-center justify-center">
                <Zap size={17} className="text-[#22C55E]" />
              </div>
              <span className="text-[17px] font-semibold text-[#0F1E3C] tracking-tight">
                Enerlynx Portal
              </span>
            </div>

            <div className="border-t border-[#E2E8F0] mb-7" />

            {/* Heading */}
            <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight mb-1">
              Sign in
            </h1>
            <p className="text-[13px] text-gray-400 mb-7">
              Enter your credentials to continue
            </p>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[12px] rounded-lg px-3.5 py-2.5 mb-5">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">
                  Email address
                </Label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 bg-[#F8FAFC] border-[#E2E8F0] text-[13px] text-[#0F1E3C] placeholder:text-[#CBD5E1] focus-visible:ring-0 focus-visible:border-[#0F1E3C]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">
                  Password
                </Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 bg-[#F8FAFC] border-[#E2E8F0] text-[13px] text-[#0F1E3C] placeholder:text-[#CBD5E1] focus-visible:ring-0 focus-visible:border-[#0F1E3C]"
                />
              </div>

              <div className="text-right -mt-1">
                <a
                  href="#"
                  className="text-[12px] text-gray-400 hover:text-[#0F1E3C] transition-colors"
                >
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-[42px] bg-[#0F1E3C] hover:bg-[#162847] text-white text-[14px] font-medium rounded-lg transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <p className="text-[11px] text-[#CBD5E1] text-center mt-8">
              © 2026 Enerlynx Pvt Ltd
            </p>

          </CardContent>
        </Card>
      </div>
    </div>
  )
}