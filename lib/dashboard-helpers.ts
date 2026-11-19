import type { HelpRequest, NotificationItem } from './types'

export function dedupeNotifications(items: NotificationItem[]): NotificationItem[] {
  const keyed = new Map<string, NotificationItem>()

  for (const item of [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
    const signature = `${item.type}:${item.message}:${item.link ?? 'none'}:${item.userId ?? 'global'}`
    if (!keyed.has(signature)) {
      keyed.set(signature, item)
    }
  }

  return Array.from(keyed.values())
}

export function getRequestProgress(status: HelpRequest['status']): number {
  switch (status) {
    case 'submitted':
      return 12
    case 'under_review':
      return 28
    case 'in_progress':
      return 64
    case 'awaiting_beneficiary_verification':
      return 82
    case 'verified_completed':
    case 'resolved':
      return 100
    case 'partially_completed':
      return 76
    case 'beneficiary_reported_issue':
    case 'needs_follow_up':
    case 'task_blocked':
    case 'unable_to_contact':
      return 48
    case 'cancelled':
      return 0
    default:
      return 0
  }
}

export function maskContactDetail(value?: string): string {
  if (!value) return 'Private'
  if (value.length <= 3) return `${'*'.repeat(value.length)}`
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`
}

export function getStatusBadgeInfo(status: HelpRequest['status']): {
  label: string
  bg: string
  color: string
  borderColor: string
} {
  switch (status) {
    case 'submitted':
      return { label: 'Submitted', bg: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }
    case 'under_review':
      return { label: 'Under Review', bg: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }
    case 'in_progress':
      return { label: 'In Progress', bg: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }
    case 'awaiting_beneficiary_verification':
      return { label: 'Awaiting Beneficiary Confirmation', bg: '#fef9c3', color: '#854d0e', borderColor: '#fef08a' }
    case 'verified_completed':
      return { label: 'Verified Completed', bg: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' }
    case 'partially_completed':
      return { label: 'Partially Delivered', bg: '#ffedd5', color: '#9a3412', borderColor: '#fed7aa' }
    case 'beneficiary_reported_issue':
      return { label: 'Issue Reported by Beneficiary', bg: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }
    case 'needs_follow_up':
      return { label: 'Needs Follow-up', bg: '#fef3c7', color: '#b45309', borderColor: '#fde68a' }
    case 'task_blocked':
      return { label: 'Task Blocked', bg: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }
    case 'unable_to_contact':
      return { label: 'Unable to Contact', bg: '#f3e8ff', color: '#6b21a8', borderColor: '#e9d5ff' }
    case 'resolved':
      return { label: 'Resolved & Closed', bg: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }
    case 'cancelled':
      return { label: 'Cancelled', bg: '#f3f4f6', color: '#4b5563', borderColor: '#e5e7eb' }
    default:
      return { label: (status as string).replace(/_/g, ' '), bg: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
  }
}

export function getUrgencyBadgeInfo(urgency: HelpRequest['urgency']): {
  label: string
  bg: string
  color: string
} {
  switch (urgency) {
    case 'critical':
      return { label: 'Critical Urgency', bg: '#fee2e2', color: '#991b1b' }
    case 'high':
      return { label: 'High Priority', bg: '#ffedd5', color: '#9a3412' }
    case 'medium':
      return { label: 'Medium', bg: '#fef9c3', color: '#854d0e' }
    case 'low':
      return { label: 'Low', bg: '#f1f5f9', color: '#475569' }
    default:
      return { label: urgency, bg: '#f1f5f9', color: '#475569' }
  }
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export function getRelativeTime(isoString?: string): string {
  if (!isoString) return ''
  try {
    const ms = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(isoString).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export interface TimelineStep {
  title: string
  description: string
  state: 'complete' | 'current' | 'upcoming' | 'alert'
  date?: string
}

export function getRequestTimeline(request: HelpRequest): TimelineStep[] {
  const steps: TimelineStep[] = []

  // Step 1: Submission
  steps.push({
    title: 'Request Submitted',
    description: `Submitted by ${request.seekerName}`,
    state: 'complete',
    date: request.createdAt,
  })

  // Step 2: Review / NGO Assignment
  const hasNgo = !!request.assignedNgoId
  if (['submitted'].includes(request.status)) {
    steps.push({
      title: 'Partner NGO Review',
      description: 'Matching with verified local NGOs in your city',
      state: 'current',
    })
  } else {
    steps.push({
      title: 'NGO Assigned',
      description: request.assignedNgoName ? `Assigned to ${request.assignedNgoName}` : 'Accepted by partner NGO',
      state: hasNgo ? 'complete' : 'current',
    })
  }

  // Step 3: Volunteer Assignment & Work In Progress
  const hasVolunteer = !!request.assignedVolunteerId
  const inWork = ['in_progress', 'awaiting_beneficiary_verification', 'verified_completed', 'partially_completed', 'beneficiary_reported_issue', 'needs_follow_up', 'task_blocked', 'unable_to_contact', 'resolved'].includes(request.status)

  if (request.status === 'under_review') {
    steps.push({
      title: 'Volunteer Assignment',
      description: 'NGO is assigning a verified volunteer responder',
      state: 'upcoming',
    })
  } else {
    steps.push({
      title: hasVolunteer ? (request.assignedVolunteerName ? `Volunteer Assigned (${request.assignedVolunteerName})` : 'Volunteer Assigned') : 'Volunteer Coordination',
      description: request.status === 'in_progress' ? 'Volunteer is actively working on your assistance' : inWork ? 'Volunteer assistance initiated' : 'Pending volunteer assignment',
      state: request.status === 'in_progress' ? 'current' : inWork ? 'complete' : 'upcoming',
    })
  }

  // Step 4: Completion & Beneficiary Verification
  if (request.status === 'awaiting_beneficiary_verification') {
    steps.push({
      title: 'Awaiting Your Confirmation',
      description: 'Volunteer completed the visit! Please confirm delivery below.',
      state: 'current',
    })
  } else if (request.status === 'beneficiary_reported_issue') {
    steps.push({
      title: 'Issue Under Investigation',
      description: request.issueDetails || 'Problem reported by beneficiary; NGO investigating',
      state: 'alert',
    })
  } else if (['verified_completed', 'partially_completed', 'resolved'].includes(request.status)) {
    steps.push({
      title: request.status === 'partially_completed' ? 'Partially Delivered' : 'Delivery Confirmed',
      description: request.beneficiaryConfirmedAt ? `Confirmed by beneficiary on ${formatDateTime(request.beneficiaryConfirmedAt)}` : 'Delivery verified by beneficiary',
      state: 'complete',
      date: request.beneficiaryConfirmedAt,
    })
  } else {
    steps.push({
      title: 'Beneficiary Confirmation',
      description: 'Verify items/service received and rate volunteer',
      state: 'upcoming',
    })
  }

  // Step 5: Resolution
  if (request.status === 'resolved') {
    steps.push({
      title: 'Completed & Resolved',
      description: request.resolutionNotes ? `Resolution: ${request.resolutionNotes}` : 'Request successfully fulfilled and closed',
      state: 'complete',
      date: request.resolvedAt || request.updatedAt,
    })
  } else if (request.status === 'cancelled') {
    steps.push({
      title: 'Request Cancelled',
      description: 'This support request was cancelled',
      state: 'alert',
      date: request.updatedAt,
    })
  }

  return steps
}
