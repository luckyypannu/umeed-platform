'use client'

import { useState } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import { categories } from './CategoryGrid'
import PageTitle from './PageTitle'
import { api } from '../lib/api'
import { HelpRequest } from '../lib/types'

export default function RequestSupportPage({
  selectedCategory = '',
  onViewRequests,
}: {
  selectedCategory?: string
  onViewRequests?: () => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState(selectedCategory)
  const [createdRequest, setCreatedRequest] = useState<HelpRequest | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const description = String(form.get('description') ?? '').trim()
    const city = String(form.get('city') ?? '').trim()
    const locality = String(form.get('locality') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    const urgency = String(form.get('urgency') ?? 'medium')

    if (!category || !description || !city) {
      return setError(t('validation.required'))
    }

    setError('')
    setLoading(true)

    try {
      const res = await api.createRequest({
        category,
        description,
        city,
        locality,
        phone,
        urgency,
      })
      setCreatedRequest(res)
    } catch (err: any) {
      setError(err.message || 'Failed to submit request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="dash-content">
      <PageTitle
        eyebrow={t('nav.getHelp')}
        title={createdRequest ? t('request.submittedTitle') : t('request.title')}
        text="Your request is made available to verified organizations eligible by location and support category. UMEED does not automatically assign a coordinator."
      />

      {createdRequest ? (
        <section className="submitted-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="success-icon" style={{ background: '#e5f0e9', padding: '8px', borderRadius: '50%', display: 'inline-flex' }}>
              <Check style={{ color: '#135b3a' }} />
            </span>
            <div>
              <h2 style={{ margin: 0 }}>Request ID: {createdRequest.id}</h2>
              <span className="status" style={{ marginTop: '4px' }}>
                {createdRequest.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>

          <p style={{ marginTop: '12px' }}>
            Category: <strong>{createdRequest.category}</strong> · City: <strong>{createdRequest.city}</strong>
          </p>
          <p style={{ color: '#68766e', fontSize: '14px' }}>
            {createdRequest.description}
          </p>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            {onViewRequests && (
              <button className="btn" onClick={onViewRequests}>
                View My Requests <ArrowRight />
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => {
                setCreatedRequest(null)
                setCategory('')
              }}
            >
              Submit Another Request
            </button>
          </div>
        </section>
      ) : (
        <form className="support-form" onSubmit={submit} noValidate>
          <label htmlFor="request-category">
            {t('request.category')}
            <select
              id="request-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">{t('request.selectCategory')}</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label htmlFor="request-description">
            {t('request.description')}
            <textarea
              id="request-description"
              name="description"
              rows={4}
              placeholder="Describe the assistance you or someone else needs in detail..."
              required
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label htmlFor="request-city">
              {t('request.city')}
              <input id="request-city" name="city" placeholder="e.g. Indore" required />
            </label>

            <label htmlFor="request-locality">
              {t('form.locality')}
              <input id="request-locality" name="locality" placeholder="e.g. Vijay Nagar" />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label htmlFor="request-phone">
              Contact Phone (optional)
              <input id="request-phone" name="phone" placeholder="10-digit mobile number" />
            </label>

            <label htmlFor="request-urgency">
              Urgency Level
              <select id="request-urgency" name="urgency" defaultValue="medium">
                <option value="low">Standard / Low</option>
                <option value="medium">Moderate / Medium</option>
                <option value="high">Urgent / High</option>
                <option value="critical">Critical / Immediate</option>
              </select>
            </label>
          </div>

          {error && (
            <div className="form-errors" role="alert">
              <p>{error}</p>
            </div>
          )}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Submitting...' : t('request.submit')}
          </button>
        </form>
      )}
    </main>
  )
}
