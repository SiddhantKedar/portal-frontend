export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  role: 'ADMIN' | 'INSTALLER' | 'CUSTOMER'
  installers: { id: number; name: string }[]
  customer_id: number | null
  customer_name: string | null
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