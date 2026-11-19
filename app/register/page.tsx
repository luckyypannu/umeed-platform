'use client'

import { useRouter } from 'next/navigation'
import { RoleSelectionPage } from '../../components/PublicShell'
import LanguageSelector from '../../components/LanguageSelector'
import { useTranslation } from '../../lib/useTranslation'

export default function RegisterPage() {
  const router = useRouter()
  const { lang, setLang } = useTranslation()
  return (
    <main>
      <LanguageSelector value={lang} onChange={setLang} />
      <RoleSelectionPage
        navigate={(route) =>
          router.push(`/register/${route.replace('register-', '')}`)
        }
      />
    </main>
  )
}
