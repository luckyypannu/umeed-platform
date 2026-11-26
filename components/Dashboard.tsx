'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import { useAuth } from '../lib/auth-context'
import { api } from '../lib/api'
import type {
  HelpRequest,
  AuditEventSummary,
  NotificationItem,
  OpportunityApplicant,
  PublicVolunteerProfile,
  EmergencyAlert,
  Role,
  VerificationTarget,
  VolunteerOpportunity,
  ImpactStats,
  SafeUser,
} from '../lib/types'
import { dedupeNotifications } from '../lib/dashboard-helpers'
import NotificationCenter from './NotificationCenter'
import SeekerDashboard from './dashboards/SeekerDashboard'
import VolunteerDashboard from './dashboards/VolunteerDashboard'
import NgoDashboard from './dashboards/NgoDashboard'
import AdminDashboard from './dashboards/AdminDashboard'

export default function Dashboard({
  role = 'seeker',
  navigate,
}: {
  role: Role
  navigate: (route: string) => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const { user, refreshUser } = useAuth()

  const urlTab = params.get('tab') ?? 'overview'

  const [requests, setRequests] = useState<HelpRequest[]>([])
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([])
  const [opportunityApplicants, setOpportunityApplicants] = useState<Record<string, OpportunityApplicant[]>>({})
  const [availableVolunteers, setAvailableVolunteers] = useState<PublicVolunteerProfile[]>([])
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([])
  const [availableEmergencyResponders, setAvailableEmergencyResponders] = useState<Array<{ id: string; name: string }>>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEventSummary[]>([])
  const [verificationNgos, setVerificationNgos] = useState<VerificationTarget[]>([])
  const [verificationVolunteers, setVerificationVolunteers] = useState<VerificationTarget[]>([])
  const [impactStats, setImpactStats] = useState<ImpactStats | null>(null)

  const [dataError, setDataError] = useState('')
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking')
  const [isLoading, setIsLoading] = useState(true)

  const deduped = dedupeNotifications(notifications)
  const unreadCount = deduped.filter((n) => !n.read).length

  const setTab = (nextTab: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', nextTab)
    router.push(url.pathname + url.search)
  }

  // Fetch all backend data based on role
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setDataError('')
    try {
      const loadRequests = () => api.getRequests()
      const notificationPromise = api.getNotifications().catch(() => [])

      if (role === 'admin') {
        const [reqList, notifs, ngos, volunteers, emergencies, publicNgos, publicVolunteers, audit, stats] =
          await Promise.all([
            loadRequests(),
            notificationPromise,
            api.getNgosForAdmin().catch(() => []),
            api.getVolunteersForAdmin().catch(() => []),
            api.getEmergencyAlerts().catch(() => []),
            api.getNgos().catch(() => []),
            api.getVolunteers().catch(() => []),
            api.getAuditEvents(50).catch(() => []),
            api.getImpactStats().catch(() => null),
          ])

        setRequests(reqList)
        setNotifications(notifs)
        setVerificationNgos(ngos)
        setVerificationVolunteers(volunteers)
        setEmergencyAlerts(emergencies)
        setImpactStats(stats)
        setAvailableEmergencyResponders([
          ...publicNgos.map((ngo) => ({ id: ngo.id, name: ngo.orgName || ngo.name })),
          ...publicVolunteers.map((vol) => ({ id: vol.id, name: vol.name })),
        ])
        setAuditEvents(audit)
      } else if (role === 'ngo') {
        const isVerified = user?.status === 'verified'
        const [reqList, notifs, volunteers, ops, stats] = await Promise.all([
          isVerified ? loadRequests().catch(() => []) : Promise.resolve([]),
          notificationPromise,
          isVerified ? api.getVolunteers().catch(() => []) : Promise.resolve([]),
          api.getOpportunities().catch(() => []),
          api.getImpactStats().catch(() => null),
        ])

        setRequests(reqList)
        setNotifications(notifs)
        setAvailableVolunteers(volunteers)
        setOpportunities(ops)
        setImpactStats(stats)
      } else if (role === 'volunteer') {
        const isVerified = user?.status === 'verified'
        const [ops, reqList, notifs, stats] = await Promise.all([
          api.getOpportunities().catch(() => []),
          isVerified ? loadRequests().catch(() => []) : Promise.resolve([]),
          notificationPromise,
          api.getImpactStats().catch(() => null),
        ])

        setOpportunities(ops)
        setRequests(reqList)
        setNotifications(notifs)
        setImpactStats(stats)
      } else {
        // Seeker
        const [reqList, notifs, stats] = await Promise.all([
          loadRequests().catch(() => []),
          notificationPromise,
          api.getImpactStats().catch(() => null),
        ])

        setRequests(reqList)
        setNotifications(notifs)
        setImpactStats(stats)
      }

      setBackendStatus('ready')
    } catch (err: any) {
      setBackendStatus('unavailable')
      setDataError('Some backend records could not be loaded. Please click Refresh.')
    } finally {
      setIsLoading(false)
    }
  }, [role, user?.id, user?.status])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handlers for Seeker
  const handleCreateRequest = async (data: {
    category: string
    description: string
    city: string
    locality?: string
    urgency: string
    title?: string
    phone?: string
  }) => {
    const created = await api.createRequest(data)
    setRequests((prev) => [created, ...prev])
    await fetchData()
  }

  const handleUpdateRequest = async (id: string, updates: Partial<HelpRequest>) => {
    const updated = await api.updateRequest(id, updates)
    setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
  }

  const handleCancelRequest = async (id: string) => {
    const updated = await api.updateRequest(id, { status: 'cancelled' })
    setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
  }

  const handleConfirmDelivery = async (
    request: HelpRequest,
    outcome: 'fully-delivered' | 'partially-delivered' | 'not-delivered',
    data: { rating?: number; explanation?: string; feedback?: string; issueType?: string },
  ) => {
    const statusMap = {
      'fully-delivered': 'verified_completed',
      'partially-delivered': 'partially_completed',
      'not-delivered': 'beneficiary_reported_issue',
    } as const

    const updated = await api.updateRequest(request.id, {
      status: statusMap[outcome],
      deliveryOutcome: outcome,
      rating: data.rating,
      issueType: data.issueType || (outcome === 'not-delivered' ? 'delivery_issue' : undefined),
      issueDetails: data.explanation || undefined,
      note: data.feedback || undefined,
    })

    setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)))
  }

  const handleReportIssue = async (request: HelpRequest, issueType: string, issueDetails: string) => {
    const updated = await api.updateRequest(request.id, {
      status: 'beneficiary_reported_issue',
      issueType,
      issueDetails,
    })
    setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)))
  }

  const handleRateVolunteer = async (request: HelpRequest, rating: number) => {
    const updated = await api.updateRequest(request.id, { rating })
    setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)))
  }

  // Handlers for Volunteer
  const handleApplyOpportunity = async (opportunityId: string) => {
    const updated = await api.applyToOpportunity(opportunityId)
    setOpportunities((prev) => prev.map((o) => (o.id === opportunityId ? updated : o)))
  }

  const handleUpdateTaskStatus = async (requestId: string, status: string, note?: string) => {
    const updated = await api.updateRequest(requestId, { status, note })
    setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)))
  }

  const handleSubmitCompletionReport = async (
    request: HelpRequest,
    reportData: {
      completionReport: string
      visitDate: string
      visitTime: string
      itemsDelivered: string
      quantityDelivered: string
      volunteerNotes: string
      volunteerAvailableAgain: boolean
      followUpNeeded: boolean
      deliveryOutcome: 'fully-delivered' | 'partially-delivered' | 'not-delivered'
      obstacleDetails?: string
    },
  ) => {
    const nextStatus =
      reportData.deliveryOutcome === 'not-delivered'
        ? 'needs_follow_up'
        : 'awaiting_beneficiary_verification'

    const updated = await api.updateRequest(request.id, {
      status: nextStatus,
      completionReport: reportData.completionReport,
      visitDate: reportData.visitDate,
      visitTime: reportData.visitTime,
      itemsDelivered: reportData.itemsDelivered,
      quantityDelivered: reportData.quantityDelivered,
      volunteerNotes: reportData.volunteerNotes,
      volunteerAvailableAgain: reportData.volunteerAvailableAgain,
      followUpNeeded: reportData.followUpNeeded,
      deliveryOutcome: reportData.deliveryOutcome,
      issueType: reportData.obstacleDetails ? 'obstacle' : undefined,
      issueDetails: reportData.obstacleDetails,
    })

    setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)))
  }

  // Handlers for NGO
  const handleAcceptRequest = async (requestId: string) => {
    const updated = await api.updateRequest(requestId, {
      assignedNgoId: user?.id,
      assignedNgoName: user?.orgName || user?.name,
      status: 'under_review',
    })
    setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)))
  }

  const handleAssignVolunteer = async (requestId: string, volunteerId: string) => {
    const updated = await api.updateRequest(requestId, {
      assignedVolunteerId: volunteerId,
      status: 'in_progress',
    })
    setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)))
  }

  const handleResolveDispute = async (
    requestId: string,
    resolutionNotes: string,
    status: 'resolved' | 'needs_follow_up',
  ) => {
    const updated = await api.updateRequest(requestId, {
      status,
      resolutionNotes,
    })
    setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)))
  }

  const handleCreateOpportunity = async (data: {
    title: string
    category: string
    mode: 'In-person' | 'Remote'
    city: string
    description: string
  }) => {
    const created = await api.createOpportunity(data)
    setOpportunities((prev) => [created, ...prev])
  }

  const handleLoadApplicants = async (opportunityId: string) => {
    try {
      const applicants = await api.getOpportunityApplicants(opportunityId)
      setOpportunityApplicants((prev) => ({ ...prev, [opportunityId]: applicants }))
    } catch (err) {
      console.error(err)
    }
  }

  const handleAcceptApplicant = async (opportunityId: string, volunteerId: string) => {
    await api.acceptOpportunityApplicant(opportunityId, volunteerId)
    setOpportunityApplicants((prev) => ({
      ...prev,
      [opportunityId]: (prev[opportunityId] ?? []).map((app) =>
        app.volunteerId === volunteerId ? { ...app, status: 'accepted' } : app,
      ),
    }))
  }

  // Handlers for Admin
  const handleVerifyNgo = async (id: string, decision: 'verified' | 'rejected') => {
    await api.verifyNgo(id, decision)
    setVerificationNgos((prev) => prev.filter((item) => item.id !== id))
    await fetchData()
  }

  const handleVerifyVolunteer = async (id: string, decision: 'verified' | 'rejected') => {
    await api.verifyVolunteer(id, decision)
    setVerificationVolunteers((prev) => prev.filter((item) => item.id !== id))
    await fetchData()
  }

  const handleAuthorizeEmergencyResponders = async (alertId: string, responderIds: string[]) => {
    await api.authorizeEmergencyResponders(alertId, responderIds)
    setEmergencyAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, authorizedResponderIds: responderIds } : a)),
    )
  }

  const handleAdminResolveRequest = async (requestId: string, notes: string) => {
    const updated = await api.updateRequest(requestId, {
      status: 'resolved',
      resolutionNotes: notes,
    })
    setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)))
  }

  // Profile update
  const handleUpdateProfile = async (updates: Partial<SafeUser>) => {
    await api.updateMe(updates)
    await refreshUser()
  }

  // Notification mark as read
  const handleMarkNotificationRead = async (id: string) => {
    await api.markNotificationRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  if (!user) return null

  return (
    <div className="dash-content max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top System Health Bar & Notification Bell Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              backendStatus === 'ready'
                ? 'bg-emerald-500 animate-pulse'
                : backendStatus === 'checking'
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
          />
          <span className="text-xs font-semibold text-slate-700">
            {backendStatus === 'ready'
              ? `UMEED Platform Online · ${role.toUpperCase()} Workspace`
              : backendStatus === 'checking'
              ? 'Verifying secure backend handshake…'
              : 'Backend connection degraded · Check connection'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Notifications Button */}
          <button
            type="button"
            onClick={() => setTab(urlTab === 'notifications' ? 'overview' : 'notifications')}
            className={`relative p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold ${
              urlTab === 'notifications'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
            title="Notifications"
          >
            <Bell className="w-4 h-4 text-emerald-800" />
            <span className="hidden sm:inline">Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchData}
            disabled={isLoading}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {dataError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          {dataError}
        </div>
      )}

      {/* Main Tab Content */}
      {isLoading ? (
  <div
    className="space-y-5"
    role="status"
    aria-live="polite"
    aria-label="Loading dashboard"
  >
    <div className="flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      <p className="text-sm font-medium text-slate-600">
        Loading your dashboard...
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
          <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-36 bg-slate-100 rounded animate-pulse" />
        </div>
      ))}
    </div>

    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  </div>
) : urlTab === 'notifications' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Notification Center</h2>
            <button
              type="button"
              onClick={() => setTab('overview')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              ← Back to Dashboard
            </button>
          </div>
          <NotificationCenter
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onNavigateTab={setTab}
          />
        </div>
      ) : role === 'seeker' ? (
        <SeekerDashboard
          user={user}
          requests={requests}
          notifications={notifications}
          onRefresh={fetchData}
          onCreateRequest={handleCreateRequest}
          onUpdateRequest={handleUpdateRequest}
          onCancelRequest={handleCancelRequest}
          onConfirmDelivery={handleConfirmDelivery}
          onReportIssue={handleReportIssue}
          onRateVolunteer={handleRateVolunteer}
          onNavigateTab={setTab}
        />
      ) : role === 'volunteer' ? (
        <VolunteerDashboard
          user={user}
          requests={requests}
          opportunities={opportunities}
          notifications={notifications}
          onRefresh={fetchData}
          onApplyOpportunity={handleApplyOpportunity}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onSubmitCompletionReport={handleSubmitCompletionReport}
          onUpdateProfile={handleUpdateProfile}
          onNavigateTab={setTab}
        />
      ) : role === 'ngo' ? (
        <NgoDashboard
          user={user}
          requests={requests}
          opportunities={opportunities}
          opportunityApplicants={opportunityApplicants}
          availableVolunteers={availableVolunteers}
          impactStats={impactStats}
          notifications={notifications}
          onRefresh={fetchData}
          onAcceptRequest={handleAcceptRequest}
          onAssignVolunteer={handleAssignVolunteer}
          onUpdateRequestStatus={handleUpdateTaskStatus}
          onResolveDispute={handleResolveDispute}
          onCreateOpportunity={handleCreateOpportunity}
          onAcceptApplicant={handleAcceptApplicant}
          onLoadApplicants={handleLoadApplicants}
          onUpdateProfile={handleUpdateProfile}
          onNavigateTab={setTab}
        />
      ) : (
        <AdminDashboard
          user={user}
          requests={requests}
          verificationNgos={verificationNgos}
          verificationVolunteers={verificationVolunteers}
          emergencyAlerts={emergencyAlerts}
          availableResponders={availableEmergencyResponders}
          auditEvents={auditEvents}
          impactStats={impactStats}
          notifications={notifications}
          onRefresh={fetchData}
          onVerifyNgo={handleVerifyNgo}
          onVerifyVolunteer={handleVerifyVolunteer}
          onAuthorizeEmergencyResponders={handleAuthorizeEmergencyResponders}
          onAdminResolveRequest={handleAdminResolveRequest}
          onNavigateTab={setTab}
        />
      )}
    </div>
  )
}
