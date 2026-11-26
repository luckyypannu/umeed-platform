'use client'

import { ArrowRight, HeartHandshake } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import { categories } from '../lib/categories'

export default function CategoryGrid({
  navigate,
  onSelect,
}: {
  navigate: (route: string) => void
  onSelect: (category: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="category-grid">
      {categories.map((category) => (
        <button
          className="category-card"
          key={category.id}
          onClick={() => {
            onSelect(category.label)
            navigate('request-support')
          }}
        >
          <HeartHandshake />
          <span>
            <strong>{t(category.i18nKey)}</strong>
            <small>{t('publicShell.categorySupport')}</small>
          </span>
          <ArrowRight />
        </button>
      ))}
    </div>
  )
}
