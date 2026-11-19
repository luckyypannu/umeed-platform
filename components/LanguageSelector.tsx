'use client'

import { languages, type Language } from '../lib/translations'

export default function LanguageSelector({ value, onChange }: { value: Language; onChange: (value: Language) => void }) {
  return <label className="language-select" htmlFor="language-selector"><span aria-hidden="true">文</span><select id="language-selector" value={value} onChange={(event) => onChange(event.target.value as Language)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.native}</option>)}</select></label>
}
