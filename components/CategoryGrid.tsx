'use client'

import { ArrowRight, HeartHandshake } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'

export const categories = [
  'Education',
  'Food Support',
  'Elderly Support',
  'Digital Assistance',
  'Mentoring',
  'Essential Resources',
]

export const categoryKeys: Record<string, string> = {
  Education: 'publicShell.categoryEducation',
  'Food Support': 'publicShell.categoryFood',
  'Elderly Support': 'publicShell.categoryElderly',
  'Digital Assistance': 'publicShell.categoryDigital',
  Mentoring: 'publicShell.categoryMentoring',
  'Essential Resources': 'publicShell.categoryResources',
}

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
          key={category}
          onClick={() => {
            onSelect(category)
            navigate('request-support')
          }}
        >
          <HeartHandshake />
          <span>
            <strong>{t(categoryKeys[category])}</strong>
            <small>{t('publicShell.categorySupport')}</small>
          </span>
          <ArrowRight />
        </button>
      ))}
    </div>
  )
}
