export interface User {
  id: number
  email: string
  phone_number: string | null   // 10 digits, no country code; null if not set
  first_name: string
  last_name: string
  full_name: string
  role: 'ADMIN' | 'INSTALLER' | 'CUSTOMER' | 'SITE_USER'
  installers: { id: number; name: string }[]
  customer_id: number | null
  customer_name: string | null
  site_id: number | null
  site_name: string | null
  is_active: boolean
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthTokens {
  access: string
  refresh: string
}

export interface LoginResponse {
  access: string
  refresh: string
  user: User
}