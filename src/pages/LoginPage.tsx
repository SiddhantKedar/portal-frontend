import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import api from '@/api/axios'
import type { LoginResponse } from '@/types/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setError('')

    // The field accepts an email or a phone number; the API key is still `email`
    const identifier = email.trim()
    if (!identifier.includes('@') && identifier.replace(/\D/g, '').length < 10) {
      setError('Enter a valid email or 10-digit phone number')
      return
    }

    setLoading(true)
    try {
      const response = await api.post<LoginResponse>('/auth/login/', { email: identifier, password })
      const { access, refresh, user } = response.data
      login(access, refresh, user)
      navigate('/')
    } catch (err: any) {
      const status = err?.response?.status
      setError(
        status === 401 || status === 400 ? 'Incorrect login details or password'
        : status === 403 ? 'Your account has been deactivated'
        : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white flex items-center justify-center">

      {/* Diagonal slash — black left half */}
      <div
        className="absolute inset-0 bg-black"
        style={{ clipPath: 'polygon(0 0, 58% 0, 42% 100%, 0 100%)' }}
      />

      {/* Amber accent line along the slash edge */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, #D97706, #F59E0B)',
          clipPath: 'polygon(57% 0, 59% 0, 43% 100%, 41% 100%)',
        }}
      />

      {/* Login card — centered, overlaps the slash */}
      <div className="relative z-10 w-full max-w-[400px] mx-4">
        <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 border border-[#E5E5E5]">

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <img src="/final logo-cropped.svg" alt="Enerlynx logo" className="w-full h-full object-contain" />
            </div>
            <img
        src="/Wording-dark.svg"
        alt="Enerlynx"
        className="h-[19px] w-auto object-contain"
      />
          </div>

          <h1 className="text-[20px] font-bold text-black tracking-tight mb-1">
            Sign in
          </h1>
          <p className="text-[13px] text-gray-400 mb-7">
            Enter your credentials to continue
          </p>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[12px] rounded-lg px-3.5 py-2.5 mb-5">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                Email or phone number
              </Label>
              <Input
                type="text"
                autoComplete="username"
                placeholder="Email or phone number"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 bg-white border-[#E5E5E5] text-[13px] text-black placeholder:text-gray-300 focus-visible:ring-0 focus-visible:border-black rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                Password
              </Label>
                <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 pr-10 bg-white border-[#E5E5E5] text-[13px] text-black placeholder:text-gray-300 focus-visible:ring-0 focus-visible:border-black rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-gray-400 hover:text-black transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <a href="#" className="text-[12px] text-gray-400 hover:text-black transition-colors">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-[42px] bg-amber-600 hover:bg-amber-700 text-white text-[14px] font-medium rounded-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="text-[11px] text-gray-300 text-center mt-8">
            © 2026 Enerlynx Pvt Ltd
          </p>

        </div>
      </div>

    </div>
  )
}