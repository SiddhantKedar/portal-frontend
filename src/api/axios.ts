import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

function isAuthEndpoint(url?: string) {
  return !!url && (url.includes('/auth/login/') || url.includes('/auth/refresh/'))
}

// Attach JWT token to every request automatically (except login/refresh)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token && !isAuthEndpoint(config.url)) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---- 401 handling: silent refresh, with a queue for concurrent requests ----

let isRefreshing = false
let pendingQueue: {
  resolve: (token: string) => void
  reject: (err: unknown) => void
}[] = []

function redirectToLogin() {
  localStorage.clear()
  window.location.href = '/login'
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Not a 401, or it's the login/refresh call itself, or we've already
    // retried this request once — don't attempt another refresh
    if (
      error.response?.status !== 401 ||
      isAuthEndpoint(originalRequest?.url) ||
      originalRequest._retry
    ) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) {
      redirectToLogin()
      return Promise.reject(error)
    }

    // A refresh is already in flight — queue this request and wait for it
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (newAccessToken: string) => {
            originalRequest._retry = true
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
            resolve(api(originalRequest))
          },
          reject,
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const res = await api.post('/auth/refresh/', { refresh: refreshToken })
      const { access, refresh } = res.data

      // ROTATE_REFRESH_TOKENS is on — must store both new tokens, the old
      // refresh token is now blacklisted server-side
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)

      pendingQueue.forEach((p) => p.resolve(access))
      pendingQueue = []

      originalRequest.headers.Authorization = `Bearer ${access}`
      return api(originalRequest)
    } catch (refreshErr) {
      pendingQueue.forEach((p) => p.reject(refreshErr))
      pendingQueue = []
      redirectToLogin()
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

export default api