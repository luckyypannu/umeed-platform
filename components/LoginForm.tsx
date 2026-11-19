'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import type { Role } from '../lib/types'
import FormMessage from './ui/FormMessage'
import { useAuth } from '../lib/auth-context'

export default function LoginForm({
  navigate,
}: {
  navigate: (route: string) => void
}) {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [role, setRole] = useState<Role>('seeker')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email || !password) return setError(t('validation.required'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t('validation.email'))

    setError('')
    setLoading(true)

    try {
      const loggedUser = await login({ email, password, role })
      if (loggedUser.role === 'ngo') {
        navigate('ngo-dashboard')
      } else if (loggedUser.role === 'volunteer') {
        navigate('volunteer-dashboard')
      } else {
        navigate('dashboard')
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="support-form auth-form" onSubmit={submit} noValidate>
      <span className="eyebrow">{t('login.eyebrow')}</span>
      <h1>{t('login.title')}</h1>
      <p>Sign in with the email and password you used to register.</p>

      <label htmlFor="login-role">
        {t('login.role')}
        <select
          id="login-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="seeker">{t('role.seeker')}</option>
          <option value="ngo">{t('role.ngo')}</option>
          <option value="volunteer">{t('role.volunteer')}</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <label htmlFor="login-email">
        {t('form.email')}
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label htmlFor="login-password">
        {t('form.password')}
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <FormMessage message={error} />

      <button className="btn" type="submit" disabled={loading}>
        {loading ? (
          <>Signing in...</>
        ) : (
          <>
            {t('login.submit')} <ArrowRight />
          </>
        )}
      </button>
    </form>
  )
}
