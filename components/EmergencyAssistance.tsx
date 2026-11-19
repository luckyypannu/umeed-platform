'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, MapPin, Phone, Share2, ShieldAlert } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import { api } from '../lib/api'
import { EmergencyAlert } from '../lib/types'

type LocationState =
  | 'idle'
  | 'requesting'
  | 'loading'
  | 'success'
  | 'permission-denied'
  | 'unavailable'

export default function EmergencyAssistance() {
  const { t } = useTranslation()
  const [state, setState] = useState<LocationState>('idle')
  const [coords, setCoords] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [consent, setConsent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedAlert, setSavedAlert] = useState<EmergencyAlert | null>(null)
  const [dispatchError, setDispatchError] = useState('')

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setState('unavailable')
      return
    }
    setState('loading')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setCoords({ latitude, longitude })

        try {
          const alert = await api.sendEmergencyLocation({
            latitude,
            longitude,
            accuracy,
          })
          setSavedAlert(alert)
          setState('success')
          setDispatchError('')
        } catch {
          setDispatchError('Your location was not saved to UMEED. Contact emergency services directly if you need urgent help.')
          setState('unavailable')
        }
      },
      (error) =>
        setState(
          error.code === error.PERMISSION_DENIED
            ? 'permission-denied'
            : 'unavailable',
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const link = coords
    ? `https://www.openstreetmap.org/?mlat=${coords.latitude}&mlon=${coords.longitude}#map=16/${coords.latitude}/${coords.longitude}`
    : ''

  const copy = async () => {
    if (!link || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(false)
    }
  }

  const share = async () => {
    if (!link) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: `UMEED Emergency Location (${savedAlert?.id || 'SOS'})`,
          text: `Emergency location shared via UMEED: ${link}`,
          url: link,
        })
      } else {
        await copy()
      }
    } catch {
      // user cancelled share
    }
  }

  return (
    <section className="emergency-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert style={{ color: '#a6382c', width: '22px', height: '22px' }} />
        <span className="eyebrow" style={{ color: '#a6382c', margin: 0 }}>
          PRIVATE LOCATION SHARING
        </span>
      </div>

      <h2>{t('nav.emergency')}</h2>
      <p>For immediate danger, call local emergency services directly. UMEED does not dispatch emergency services.</p>

      <a className="btn btn-danger" href="tel:112" style={{ width: 'max-content' }}>
        <Phone /> {t('emergency.call')} (112)
      </a>

      <p>Your precise location is saved only after you give consent. Emergency records expire after 24 hours.</p>

      <label className="consent" htmlFor="emergency-location-consent">
        <input
          id="emergency-location-consent"
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I consent to saving my precise location as a private UMEED record for 24 hours. UMEED does not contact or dispatch emergency services.
      </label>

      <button
        className="btn btn-secondary"
        onClick={requestLocation}
        disabled={state === 'loading' || !consent}
        style={{ width: 'max-content' }}
      >
        <MapPin style={{ width: '16px' }} />
        {state === 'requesting'
          ? t('emergency.requesting')
          : state === 'loading'
            ? t('emergency.loading')
            : t('emergency.share')}
      </button>

      {state === 'permission-denied' && (
        <div className="form-errors" role="alert">
          <p>{t('emergency.denied')}</p>
        </div>
      )}

      {state === 'unavailable' && (
        <div className="form-errors" role="alert">
          <p>{dispatchError || t('emergency.unavailable')}</p>
        </div>
      )}

      {state === 'success' && coords && (
        <div className="location-preview" style={{ display: 'grid', gap: '12px' }}>
          {savedAlert && (
            <div
              style={{
                background: '#dcfce7',
                border: '1px solid #86efac',
                padding: '10px 14px',
                borderRadius: '6px',
                color: '#166534',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 style={{ width: '18px', height: '18px' }} />
              <div>
                <strong>Private UMEED record saved: {savedAlert.id}</strong>
                <div style={{ fontSize: '12px' }}>
                  Expires {new Date(savedAlert.expiresAt).toLocaleString()}. No emergency services or responders were contacted.
                </div>
              </div>
            </div>
          )}

          {dispatchError && (
            <div className="form-errors" role="alert">
              <p>{dispatchError}</p>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapPin style={{ color: '#135b3a' }} />
            <div>
              <strong>{t('emergency.review')}</strong>
              <p style={{ margin: 0 }}>
                Latitude: {coords.latitude.toFixed(5)}, Longitude: {coords.longitude.toFixed(5)}
              </p>
            </div>
          </div>

          <a
            className="text-button"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            View this location on OpenStreetMap
          </a>

          <div className="location-actions">
            <button className="btn btn-secondary" onClick={copy}>
              <Copy />
              {copied ? t('emergency.copied') : t('emergency.copy')}
            </button>
            <button className="btn" onClick={share}>
              <Share2 />
              {t('emergency.shareDevice')}
            </button>
            {savedAlert && (
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await api.deleteEmergencyAlert(savedAlert.id)
                    setSavedAlert(null)
                    setCoords(null)
                    setState('idle')
                    setDispatchError('')
                  } catch {
                    setDispatchError('The private location record could not be deleted. Try again.')
                  }
                }}
              >
                Delete private record
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
