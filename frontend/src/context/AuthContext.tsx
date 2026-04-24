import type { ReactNode } from 'react'
import { createContext, useContext, useState, useEffect} from 'react'
import { auth } from '../api/endpoints'

interface User {
  id: number; username: string; email: string; first_name: string; last_name: string
  full_name: string; role: string; can_manage_users: boolean; can_edit_prices: boolean
  can_adjust_stock: boolean; can_create_po: boolean
}

interface AuthContextType {
  user: User | null; loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isRole: (...roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      auth.me().then(res => { setUser(res.data); setLoading(false) })
        .catch(() => { localStorage.clear(); setLoading(false) })
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username: string, password: string) => {
    const res = await auth.login(username, password)
    localStorage.setItem('access_token', res.data.access)
    localStorage.setItem('refresh_token', res.data.refresh)
    const me = await auth.me()
    setUser(me.data)
  }

  const logout = () => {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) auth.logout(refresh).catch(() => {})
    localStorage.clear()
    setUser(null)
  }

  const isRole = (...roles: string[]) => !!user && roles.includes(user.role)

  return <AuthContext.Provider value={{ user, loading, login, logout, isRole }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
