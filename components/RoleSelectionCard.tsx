'use client'

import type { LucideIcon } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'

export default function RoleSelectionCard({
  title,
  description,
  Icon,
  selected,
  onSelect,
}: {
  title: string
  description: string
  Icon: LucideIcon
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={`role-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <Icon />
      <h2>{title}</h2>
      <p>{description}</p>
      {selected && <span className="role-check">{t('role.selected')}</span>}
    </button>
  )
}
