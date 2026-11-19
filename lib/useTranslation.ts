'use client'

import { useEffect, useState } from 'react'
import { languages, translations, type Language } from './translations'

export function useTranslation() {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    const saved = window.localStorage.getItem('umeed-language') as Language | null
    if (saved && languages.some((language) => language.code === saved)) setLangState(saved)
    const handleLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail
      if (languages.some((language) => language.code === next)) setLangState(next)
    }
    window.addEventListener('umeed-language-change', handleLanguageChange)
    return () => window.removeEventListener('umeed-language-change', handleLanguageChange)
  }, [])

  const setLang = (next: Language) => {
    setLangState(next)
    window.localStorage.setItem('umeed-language', next)
    window.dispatchEvent(new CustomEvent('umeed-language-change', { detail: next }))
  }

  const t = (key: string) => translations[key]?.[lang] ?? translations[key]?.en ?? key
  return { t, lang, setLang }
}
