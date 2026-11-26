'use client'

import { useRouter } from 'next/navigation'
import LoginForm from '../../components/LoginForm'
import LanguageSelector from '../../components/LanguageSelector'
import { useTranslation } from '../../lib/useTranslation'

export default function LoginClient() {
  const router = useRouter()
  const { lang, setLang } = useTranslation()
  return (
    <main className="auth-page">
      <LanguageSelector value={lang} onChange={setLang} />
      <LoginForm
        navigate={(route) =>
          router.push(
            route === 'dashboard'
              ? '/dashboard'
              : route === 'ngo-dashboard'
                ? '/dashboard?role=ngo'
                : '/dashboard?role=volunteer',
          )
        }
      />
    </main>
  )
}
