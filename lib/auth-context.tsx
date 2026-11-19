'use client'

import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Role, SafeUser } from './types'

interface AuthContextType {
  user: SafeUser | null
  role: Role
  token: string | null
  isLoading: boolean
  login: (credentials: { email: string; password: string; role?: Role }) => Promise<SafeUser>
  register: (formData: Record<string, any>) => Promise<{ user: SafeUser; message: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<SafeUser | null>
  setUser: React.Dispatch<React.SetStateAction<SafeUser | null>>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const authEpoch = useRef(0)

  const role: Role = user?.role || 'seeker'

  useEffect(() => {
    const handleSessionExpired = () => {
      authEpoch.current += 1
      api.setToken(null)
      api.setCsrfToken(null)
      setToken(null)
      setUser(null)
    }
    window.addEventListener('umeed-session-expired', handleSessionExpired)
    api.clearLegacyAuthStorage()
    const initialEpoch = authEpoch.current
    api
      .getMe()
      .then((fetchedUser) => {
        if (authEpoch.current !== initialEpoch) return
        setUser(fetchedUser)
        setToken(api.getToken())
      })
      .catch(() => {
        if (authEpoch.current !== initialEpoch) return
        api.setToken(null)
        api.setCsrfToken(null)
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        if (authEpoch.current === initialEpoch) setIsLoading(false)
      })
    return () => window.removeEventListener('umeed-session-expired', handleSessionExpired)
  }, [])

  const login = async (credentials: { email: string; password: string; role?: Role }) => {
    const epoch = ++authEpoch.current
    setIsLoading(true)
    try {
      const res = await api.login(credentials)
      if (authEpoch.current === epoch) {
        setUser(res.user)
        setToken(res.token)
      }
      return res.user
    } finally {
      if (authEpoch.current === epoch) setIsLoading(false)
    }
  }

  const register = async (formData: Record<string, any>) => {
    setIsLoading(true)
    try {
      const res = await api.register(formData)
      return { user: res.user, message: res.message }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    authEpoch.current += 1
    try {
      await api.logout()
    } finally {
      setUser(null)
      setToken(null)
    }
  }

  const refreshUser = async () => {
    const epoch = ++authEpoch.current
    try {
      const refreshed = await api.getMe()
      if (authEpoch.current !== epoch) return null
      setUser(refreshed)
      setToken(api.getToken())
      return refreshed
    } catch {
      if (authEpoch.current !== epoch) return null
      api.setToken(null)
      api.setCsrfToken(null)
      setToken(null)
      setUser(null)
      return null
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
