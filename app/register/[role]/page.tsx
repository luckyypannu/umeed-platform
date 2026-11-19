'use client'

import { useParams, useRouter } from 'next/navigation'
import type { Role } from '../../../lib/types'
import RegistrationForm from '../../../components/RegistrationForm'
import LanguageSelector from '../../../components/LanguageSelector'
import { useTranslation } from '../../../lib/useTranslation'

export default function RegisterRolePage() {
  const params = useParams<{ role: string }>()
  const router = useRouter()
  const role = params.role as Role
  const { lang, setLang } = useTranslation()
  return (
    <main className="auth-page">
      <LanguageSelector value={lang} onChange={setLang} />
      <RegistrationForm
        role={role}
        navigate={(route) => router.push(route === 'login' ? '/login' : '/register')}
      />
    </main>
  )
}
