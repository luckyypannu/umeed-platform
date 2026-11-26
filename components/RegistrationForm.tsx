'use client'

import { useState } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import type { Role } from '../lib/types'
import { categories } from '../lib/categories'
import FormMessage from './ui/FormMessage'
import { api } from '../lib/api'

const roleNames: Record<Role, string> = {
  seeker: 'role.seeker',
  ngo: 'role.ngo',
  volunteer: 'role.volunteer',
  admin: 'Admin',
}

export default function RegistrationForm({
  role,
  navigate,
}: {
  role: Role
  navigate: (route: string) => void
}) {
  const { t } = useTranslation()
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get(role === 'ngo' ? 'officialEmail' : 'email') ?? '')
    const phone = String(form.get('phone') ?? '')
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirmPassword') ?? '')

    const required =
      role === 'ngo'
        ? [
            'orgName',
            'contactPerson',
            'officialEmail',
            'phone',
            'address',
            'operatingCity',
            'password',
            'confirmPassword',
          ]
        : ['fullName', 'email', 'password', 'confirmPassword', 'phone', 'city', 'locality']

    if (required.some((field) => !String(form.get(field) ?? '').trim()))
      return setError(t('validation.required'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t('validation.email'))
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) return setError(t('validation.phone'))
    if (password.length < 8) return setError(t('validation.password'))
    if (password !== confirm) return setError(t('validation.match'))
    if ((role === 'ngo' || role === 'volunteer') && selectedCategories.length === 0)
      return setError(t('validation.category'))

    setError('')
    setLoading(true)

    try {
      const payload: Record<string, any> = {
        role,
        password,
        phone,
      }

      if (role === 'ngo') {
        payload.orgName = String(form.get('orgName') ?? '')
        payload.contactPerson = String(form.get('contactPerson') ?? '')
        payload.officialEmail = email
        payload.regNumber = String(form.get('regNumber') ?? '')
        payload.address = String(form.get('address') ?? '')
        payload.operatingCity = String(form.get('operatingCity') ?? '')
        payload.areasOfSupport = selectedCategories
      } else {
        payload.fullName = String(form.get('fullName') ?? '')
        payload.email = email
        payload.city = String(form.get('city') ?? '')
        payload.locality = String(form.get('locality') ?? '')
        if (role === 'volunteer') {
          payload.skills = String(form.get('skills') ?? '')
          payload.interests = String(form.get('interests') ?? '')
          payload.availableDays = String(form.get('availability') ?? '')
          payload.areasOfSupport = selectedCategories
        }
      }

      await api.register(payload)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="submitted-card">
        <span className="success-icon">
          <Check />
        </span>
        <h2>
          {role === 'seeker'
            ? t('register.accountCreated')
            : t(role === 'ngo' ? 'register.ngoPending' : 'register.volunteerPending')}
        </h2>
        {role !== 'seeker' && (
          <span className="status">
            {role === 'ngo' ? t('status.pendingVerification') : t('status.pendingReview')}
          </span>
        )}
        <p>Your details have been saved to the UMEED platform database.</p>
        <button className="btn" onClick={() => navigate('login')}>
          {t('nav.login')} <ArrowRight />
        </button>
      </div>
    )
  }

  return (
    <form className="support-form auth-form" onSubmit={submit} noValidate>
      <span className="eyebrow">{t('register.eyebrow')}</span>
      <h1>{t(roleNames[role])}</h1>
      <p>Fill in the form to register your account on UMEED.</p>

      {role === 'ngo' ? (
        <>
          <label htmlFor="reg-org-name">
            {t('form.orgName')}
            <input id="reg-org-name" name="orgName" required />
          </label>
          <label htmlFor="reg-contact">
            {t('form.contactPerson')}
            <input id="reg-contact" name="contactPerson" required />
          </label>
          <label htmlFor="reg-official-email">
            {t('form.officialEmail')}
            <input id="reg-official-email" name="officialEmail" type="email" autoComplete="email" required />
          </label>
          <label htmlFor="reg-ngo-phone">
            {t('form.phone')}
            <input id="reg-ngo-phone" name="phone" inputMode="numeric" required />
          </label>
          <label htmlFor="reg-number">
            {t('form.regNumber')}
            <input id="reg-number" name="regNumber" placeholder="e.g. NGO-MP-2024-XXXX" />
          </label>
          <label htmlFor="reg-address">
            {t('form.address')}
            <input id="reg-address" name="address" required />
          </label>
          <label htmlFor="reg-operating-city">
            {t('form.operatingCity')}
            <input id="reg-operating-city" name="operatingCity" required />
          </label>
        </>
      ) : (
        <>
          <label htmlFor="reg-full-name">
            {t('form.fullName')}
            <input id="reg-full-name" name="fullName" autoComplete="name" required />
          </label>
          <label htmlFor="reg-email">
            {t('form.email')}
            <input id="reg-email" name="email" type="email" autoComplete="email" required />
          </label>
          <label htmlFor="reg-phone">
            {t('form.phone')}
            <input id="reg-phone" name="phone" inputMode="numeric" required />
          </label>
          <label htmlFor="reg-city">
            {t('form.city')}
            <input id="reg-city" name="city" required />
          </label>
          <label htmlFor="reg-locality">
            {t('form.locality')}
            <input id="reg-locality" name="locality" required />
          </label>
          {role === 'volunteer' && (
            <>
              <label htmlFor="reg-skills">
                {t('form.skills')}
                <input id="reg-skills" name="skills" placeholder="e.g. Tutoring, Cooking, Driving" />
              </label>
              <label htmlFor="reg-interests">
                {t('form.interests')}
                <input id="reg-interests" name="interests" placeholder="e.g. Community learning, elder companionship" />
              </label>
              <label htmlFor="reg-availability">
                {t('form.availability')}
                <input id="reg-availability" name="availability" placeholder="e.g. Weekends, Evenings" />
              </label>
            </>
          )}
        </>
      )}

      {(role === 'ngo' || role === 'volunteer') && (
        <fieldset>
          <legend>{t('form.categories')}</legend>
          <div className="check-grid">
            {categories.map((category) => (
              <label htmlFor={`reg-category-${category.id}`} key={category.id}>
                <input
                  id={`reg-category-${category.id}`}
                  type="checkbox"
                  checked={selectedCategories.includes(category.label)}
                  onChange={() => toggleCategory(category.label)}
                />
                {t(category.i18nKey)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label htmlFor="reg-password">
        {t('form.password')}
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <label htmlFor="reg-confirm-password">
        {t('form.confirmPassword')}
        <input
          id="reg-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>

      <FormMessage message={error} />

      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Creating account...' : t('register.submit')} <ArrowRight />
      </button>
    </form>
  )
}
