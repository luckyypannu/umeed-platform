'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import { categories } from '../lib/categories'
import FormMessage from './ui/FormMessage'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth-context'

export default function VolunteerApplicationPage() {
  const { t } = useTranslation()
  const { user, isLoading } = useAuth()
  const [submitted, setSubmitted] = useState(false)
  const [selected, setSelected] = useState<string[]>(user?.areasOfSupport ?? [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toggle = (category: string) => {
    setSelected((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    )
  }

  useEffect(() => {
    setSelected(user?.areasOfSupport ?? [])
  }, [user?.id])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    const fullName = String(form.get('fullName') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    const city = String(form.get('city') ?? '').trim()
    const locality = String(form.get('locality') ?? '').trim()
    const skills = String(form.get('skills') ?? '').trim()
    const interests = String(form.get('interests') ?? '').trim()
    const availableDays = String(form.get('availableDays') ?? '').trim()
    const availableTime = String(form.get('availableTime') ?? '').trim()
    const mode = String(form.get('mode') ?? 'in-person')
    const motivation = String(form.get('motivation') ?? '').trim()

    if (!fullName || !phone || !city) {
      return setError(t('validation.required'))
    }
    if (!selected.length) {
      return setError(t('validation.category'))
    }

    setError('')
    setLoading(true)

    try {
      await api.applyAsVolunteer({
        fullName,
        phone,
        city,
        locality,
        skills,
        interests,
        categories: selected,
        availableDays: `${availableDays} (${availableTime}) - ${mode}`,
        motivation,
      })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to submit application. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) {
    return <p role="status">Loading your volunteer account…</p>
  }

  if (!user || user.role !== 'volunteer') {
    return (
      <div className="submitted-card">
        <span className="eyebrow">JOIN OUR COMMUNITY</span>
        <h2>Volunteer Application</h2>
        <p>Create or sign in to a volunteer account before adding private profile information. Applications no longer create accounts or set default passwords.</p>
        <a className="btn" href="/register/volunteer">Create volunteer account</a>
        <a className="text-button" href="/login">Sign in</a>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="submitted-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="success-icon" style={{ background: '#e5f0e9', padding: '8px', borderRadius: '50%', display: 'inline-flex' }}>
            <Check style={{ color: '#135b3a' }} />
          </span>
          <h2 style={{ margin: 0 }}>Volunteer profile saved</h2>
        </div>
        <span className="status">{user.status === 'verified' ? 'Verified' : 'Pending review'}</span>
        <p>Your private volunteer profile has been updated. Public profile details are limited to verified volunteers.</p>
      </div>
    )
  }

  return (
    <form className="support-form volunteer-form" onSubmit={submit} noValidate>
      <span className="eyebrow">JOIN OUR COMMUNITY</span>
      <h2>Volunteer Application</h2>
      <p>Update your private skills, availability, and areas where you would like to help.</p>

      <label htmlFor="vol-full-name">
        {t('form.fullName')}
        <input id="vol-full-name" required name="fullName" autoComplete="name" defaultValue={user.name} />
      </label>
      <label htmlFor="vol-phone">
        {t('form.phone')}
        <input id="vol-phone" required name="phone" inputMode="numeric" defaultValue={user.phone} />
      </label>
      <label htmlFor="vol-city">
        {t('form.city')}
        <input id="vol-city" required name="city" defaultValue={user.city} />
      </label>
      <label htmlFor="vol-locality">
        {t('form.locality')}
        <input id="vol-locality" required name="locality" defaultValue={user.locality} />
      </label>
      <label htmlFor="vol-skills">
        {t('form.skills')}
        <input id="vol-skills" required name="skills" placeholder="e.g. Teaching, Cooking, First Aid" defaultValue={user.skills} />
      </label>
      <label htmlFor="vol-interests">
        {t('form.interests')}
        <input id="vol-interests" required name="interests" placeholder="e.g. Community learning, elder companionship" defaultValue={user.interests} />
      </label>

      <fieldset>
        <legend>{t('form.categories')}</legend>
        <div className="check-grid">
          {categories.map((category) => (
            <label htmlFor={`vol-category-${category.id}`} key={category.id}>
              <input
                id={`vol-category-${category.id}`}
                type="checkbox"
                checked={selected.includes(category.label)}
                onChange={() => toggle(category.label)}
              />
              {t(category.i18nKey)}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="vol-days">
        {t('volunteer.availableDays')}
        <input
          id="vol-days"
          required
          name="availableDays"
          placeholder={t('volunteer.daysPlaceholder')}
        />
      </label>
      <label htmlFor="vol-time">
        {t('volunteer.availableTime')}
        <input
          id="vol-time"
          required
          name="availableTime"
          placeholder={t('volunteer.timePlaceholder')}
        />
      </label>
      <label htmlFor="vol-mode">
        {t('volunteer.mode')}
        <select id="vol-mode" name="mode">
          <option value="in-person">{t('volunteer.inPerson')}</option>
          <option value="remote">{t('volunteer.remote')}</option>
        </select>
      </label>
      <label htmlFor="vol-motivation">
        {t('volunteer.motivation')}
        <textarea id="vol-motivation" required name="motivation" rows={4} defaultValue={user.motivation} placeholder="Tell us why you want to volunteer with UMEED..." />
      </label>
      <FormMessage message={error} />

      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Submitting Application...' : t('register.submit')}
      </button>
    </form>
  )
}
