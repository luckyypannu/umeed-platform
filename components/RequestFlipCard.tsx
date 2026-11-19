'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Clock3, MapPin, ShieldCheck } from 'lucide-react'
import type { HelpRequest } from '../lib/types'
import { getRequestProgress } from '../lib/dashboard-helpers'

function getStatusBadgeStyle(status: HelpRequest['status']) {
  switch (status) {
    case 'submitted':
      return { background: '#fef3c7', color: '#92400e' }
    case 'under_review':
      return { background: '#dbeafe', color: '#1e40af' }
    case 'in_progress':
      return { background: '#e0f2fe', color: '#0f766e' }
    case 'awaiting_beneficiary_verification':
      return { background: '#ede9fe', color: '#5b21b6' }
    case 'verified_completed':
    case 'resolved':
      return { background: '#dcfce7', color: '#166534' }
    case 'partially_completed':
      return { background: '#fef3c7', color: '#92400e' }
    case 'beneficiary_reported_issue':
    case 'needs_follow_up':
    case 'task_blocked':
    case 'unable_to_contact':
      return { background: '#fee2e2', color: '#991b1b' }
    case 'cancelled':
      return { background: '#fce7f3', color: '#9d174d' }
    default:
      return { background: '#f3f4f6', color: '#374151' }
  }
}

export default function RequestFlipCard({
  request,
  onPrimaryAction,
  onSecondaryAction,
  primaryLabel,
  secondaryLabel,
  showAssignee = true,
}: {
  request: HelpRequest
  onPrimaryAction?: () => void
  onSecondaryAction?: () => void
  primaryLabel?: string
  secondaryLabel?: string
  showAssignee?: boolean
}) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    setIsDesktop(media.matches)
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const progress = getRequestProgress(request.status)
  const toggle = () => {
    if (isDesktop) setIsFlipped((current) => !current)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  const detailItems = [
    { label: 'Created', value: new Date(request.createdAt).toLocaleString() },
    { label: 'Updated', value: new Date(request.updatedAt).toLocaleString() },
    { label: 'Category', value: request.category },
    { label: 'City', value: request.city },
  ]

  return (
    <article
      className={`request-card-shell ${isFlipped ? 'is-flipped' : ''}`}
      tabIndex={0}
      aria-expanded={isFlipped}
      onClick={toggle}
      onKeyDown={onKeyDown}
      role="button"
    >
      <div className="request-card-inner">
        <div className="request-card-face request-card-front">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <span className="status" style={getStatusBadgeStyle(request.status)}>
              {request.status.replace('_', ' ').toUpperCase()}
            </span>
            <small style={{ color: '#68766e' }}>ID: {request.id}</small>
          </div>

          <h2 style={{ margin: '10px 0 6px', fontSize: '20px' }}>{request.title}</h2>
          <p style={{ color: '#4f5e55', marginBottom: '8px' }}>
            <strong>{request.category}</strong> · {request.city}{request.locality ? `, ${request.locality}` : ''}
          </p>

          <p style={{ color: '#68766e', fontSize: '14px', lineHeight: 1.5 }}>{request.description}</p>

          <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#135b3a', fontWeight: 600 }}>
              <MapPin size={15} />
              {request.assignedNgoName ? `Partner: ${request.assignedNgoName}` : 'Awaiting NGO review'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#135b3a', fontWeight: 600 }}>
              <ShieldCheck size={15} />
              {request.assignedVolunteerName ? `Volunteer: ${request.assignedVolunteerName}` : 'Volunteer assignment pending'}
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px', color: '#68766e' }}>
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#135b3a', borderRadius: '999px' }} />
            </div>
          </div>

          <div style={{ marginTop: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {onPrimaryAction && (
              <button className="btn" type="button" onClick={(event) => { event.stopPropagation(); onPrimaryAction() }}>
                {primaryLabel ?? 'Action'} <ArrowRight size={16} />
              </button>
            )}
            {onSecondaryAction && (
              <button className="btn btn-secondary" type="button" onClick={(event) => { event.stopPropagation(); onSecondaryAction() }}>
                {secondaryLabel ?? 'Details'}
              </button>
            )}
          </div>
        </div>

        <div className="request-card-face request-card-back">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span className="status" style={getStatusBadgeStyle(request.status)}>
              {request.status.replace('_', ' ').toUpperCase()}
            </span>
            <small style={{ color: '#68766e' }}>Timeline</small>
          </div>

          <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
            {detailItems.map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', borderBottom: '1px solid #edf2ee', paddingBottom: '6px' }}>
                <span style={{ color: '#68766e' }}>{item.label}</span>
                <strong style={{ textAlign: 'right', color: '#17231d' }}>{item.value}</strong>
              </div>
            ))}
          </div>

          {showAssignee && (request.assignedVolunteerName || request.assignedNgoName) && (
            <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
              {request.assignedNgoName && <p>NGO: <strong>{request.assignedNgoName}</strong></p>}
              {request.assignedVolunteerName && <p>Volunteer: <strong>{request.assignedVolunteerName}</strong></p>}
            </div>
          )}

          {request.notes && request.notes.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <p style={{ fontWeight: 700, marginBottom: '8px', color: '#135b3a' }}>Recent notes</p>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#4f5e55', lineHeight: 1.5 }}>
                {request.notes.slice(0, 3).map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
              </ul>
            </div>
          )}

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#135b3a', fontWeight: 700 }}>
              <Clock3 size={14} /> {request.status === 'cancelled' ? 'Closed' : 'Live'}
            </span>
            <button className="text-button" type="button" onClick={(event) => { event.stopPropagation(); setIsFlipped(false) }}>
              Close details
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
