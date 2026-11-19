'use client'

import Link from 'next/link'
import { useTranslation } from '../lib/useTranslation'

export const LOGO_URL = '/umeed-logo.png'

export default function Logo() {
  const { t } = useTranslation()
  return (
    <Link className="brand" href="/" aria-label={t('brand.home')}>
      <img src={LOGO_URL} alt={t('brand.logoAlt')} width={36} height={42} />
      <span>UMEED</span>
    </Link>
  )
}
