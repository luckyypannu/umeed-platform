'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  Users,
  Building2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  FileText,
  Search,
  Filter,
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Lock,
  Eye,
  ChevronRight,
  LifeBuoy,
} from 'lucide-react'
import type {
  AuditEventSummary,
  EmergencyAlert,
  HelpRequest,
  ImpactStats,
  NotificationItem,
  SafeUser,
  VerificationTarget,
} from '../../lib/types'
import {
  formatDateTime,
  getRelativeTime,
  getStatusBadgeInfo,
  getUrgencyBadgeInfo,
  getRequestProgress,
} from '../../lib/dashboard-helpers'

export default function AdminDashboard({
  user,
  requests,
  verificationNgos,
  verificationVolunteers,
  emergencyAlerts,
  availableResponders,
  auditEvents,
  impactStats,
  notifications,
  onRefresh,
  onVerifyNgo,
  onVerifyVolunteer,
  onAuthorizeEmergencyResponders,
  onAdminResolveRequest,
  onNavigateTab,
}: {
  user: SafeUser
  requests: HelpRequest[]
  verificationNgos: VerificationTarget[]
  verificationVolunteers: VerificationTarget[]
  emergencyAlerts: EmergencyAlert[]
  availableResponders: Array<{ id: string; name: string }>
  auditEvents: AuditEventSummary[]
  impactStats: ImpactStats | null
  notifications: NotificationItem[]
  onRefresh: () => void
  onVerifyNgo: (id: string, decision: 'verified' | 'rejected') => Promise<void>
  onVerifyVolunteer: (id: string, decision: 'verified' | 'rejected') => Promise<void>
  onAuthorizeEmergencyResponders: (id: string, responderIds: string[]) => Promise<void>
  onAdminResolveRequest: (requestId: string, notes: string) => Promise<void>
  onNavigateTab: (tab: string) => void
}) {
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'ngo-verifications' | 'volunteer-verifications' | 'requests-monitor' | 'disputes' | 'emergencies' | 'audit-logs'
  >('overview')

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // Responders modal
  const [managingAlertId, setManagingAlertId] = useState<string | null>(null)
  const [selectedResponders, setSelectedResponders] = useState<string[]>([])
  const [savingResponders, setSavingResponders] = useState(false)

  // Resolution modal
  const [resolvingReq, setResolvingReq] = useState<HelpRequest | null>(null)
  const [adminResolutionNotes, setAdminResolutionNotes] = useState('')
  const [submittingResolution, setSubmittingResolution] = useState(false)

  // Verification handling
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const handleNgoDecision = async (id: string, decision: 'verified' | 'rejected') => {
    setVerifyingId(id)
    try {
      await onVerifyNgo(id, decision)
    } finally {
      setVerifyingId(null)
    }
  }

  const handleVolunteerDecision = async (id: string, decision: 'verified' | 'rejected') => {
    setVerifyingId(id)
    try {
      await onVerifyVolunteer(id, decision)
    } finally {
      setVerifyingId(null)
    }
  }

  const handleSaveResponders = async () => {
    if (!managingAlertId) return
    setSavingResponders(true)
    try {
      await onAuthorizeEmergencyResponders(managingAlertId, selectedResponders)
      setManagingAlertId(null)
    } finally {
      setSavingResponders(false)
    }
  }

  const handleAdminResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolvingReq || !adminResolutionNotes.trim()) return
    setSubmittingResolution(true)
    try {
      await onAdminResolveRequest(resolvingReq.id, adminResolutionNotes.trim())
      setResolvingReq(null)
      setAdminResolutionNotes('')
    } finally {
      setSubmittingResolution(false)
    }
  }

  // Partitions
  const pendingNgos = verificationNgos.filter((n) => n.status === 'pending_verification')
  const pendingVolunteers = verificationVolunteers.filter((v) => v.status === 'pending_review')
  const openDisputes = requests.filter((r) => r.status === 'beneficiary_reported_issue')

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false
    if (categoryFilter && r.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        r.title?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.seekerName?.toLowerCase().includes(q) ||
        r.assignedNgoName?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Admin Command Header */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-slate-950 shadow-xs">
                <ShieldCheck className="w-3.5 h-3.5" /> UMEED Central Oversight
              </span>
              <span className="text-xs text-slate-300">Audited Administrator Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Platform Governance & Administration
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
              Supervise nationwide NGO operations, verify volunteers, investigate reported disputes,
              manage emergency responder dispatches, and audit state events.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('ngo-verifications')}
              className="px-4 py-2.5 bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl hover:bg-amber-300 transition shadow"
            >
              Pending Verifications ({pendingNgos.length + pendingVolunteers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('emergencies')}
              className="px-4 py-2.5 bg-red-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-red-800 transition"
            >
              Emergencies ({emergencyAlerts.length})
            </button>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          className={`pb-3 border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'overview'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Platform Overview & Stats
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('ngo-verifications')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'ngo-verifications'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          NGO Applications
          {pendingNgos.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
              {pendingNgos.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('volunteer-verifications')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'volunteer-verifications'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Volunteer Queue
          {pendingVolunteers.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
              {pendingVolunteers.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('requests-monitor')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'requests-monitor'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          All Support Requests ({requests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('disputes')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'disputes'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Escalated Disputes
          {openDisputes.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-900">
              {openDisputes.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('emergencies')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'emergencies'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Emergency Operations ({emergencyAlerts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('audit-logs')}
          className={`pb-3 border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'audit-logs'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Security Audit Trail ({auditEvents.length})
        </button>
      </div>

      {/* OVERVIEW SUBTAB */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Aggregation Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Support Requests</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{impactStats?.totalRequests ?? requests.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-emerald-700 font-medium">Resolved Deliveries</span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">
                {impactStats?.resolvedRequests ?? requests.filter((r) => ['resolved', 'verified_completed'].includes(r.status)).length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-sky-700 font-medium">Verified NGOs</span>
              <p className="text-2xl font-bold text-sky-900 mt-1">{impactStats?.registeredNgos ?? 0}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-amber-700 font-medium">Verified Field Volunteers</span>
              <p className="text-2xl font-bold text-amber-900 mt-1">{impactStats?.activeVolunteers ?? 0}</p>
            </div>
          </div>

          {/* Verification & Risk Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-amber-800 font-medium block">Pending NGO Verifications</span>
                <strong className="text-xl font-bold text-amber-950 mt-0.5 block">{pendingNgos.length} orgs</strong>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('ngo-verifications')}
                className="px-3 py-1.5 bg-amber-700 text-white text-xs font-bold rounded-lg hover:bg-amber-800"
              >
                Review
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-amber-800 font-medium block">Pending Volunteers</span>
                <strong className="text-xl font-bold text-amber-950 mt-0.5 block">{pendingVolunteers.length} applicants</strong>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('volunteer-verifications')}
                className="px-3 py-1.5 bg-amber-700 text-white text-xs font-bold rounded-lg hover:bg-amber-800"
              >
                Review
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-red-800 font-medium block">Open Beneficiary Disputes</span>
                <strong className="text-xl font-bold text-red-950 mt-0.5 block">{openDisputes.length} cases</strong>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('disputes')}
                className="px-3 py-1.5 bg-red-700 text-white text-xs font-bold rounded-lg hover:bg-red-800"
              >
                Inspect
              </button>
            </div>
          </div>

          {/* Category distribution chart / bars */}
          {impactStats?.categoryBreakdown && Object.keys(impactStats.categoryBreakdown).length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-1">Support Category Distribution (Real Aggregates)</h3>
              <p className="text-xs text-slate-500 mb-4">Breakdown of all requests by humanitarian domain</p>
              <div className="space-y-3">
                {Object.entries(impactStats.categoryBreakdown).map(([category, count]) => {
                  const pct = Math.round((count / (impactStats.totalRequests || 1)) * 100)
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-800">
                        <span>{category}</span>
                        <span>{count} requests ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NGO VERIFICATIONS SUBTAB */}
      {activeSubTab === 'ngo-verifications' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">NGO Verification Applications</h2>
            <p className="text-xs text-slate-500">
              Review organization legal registration, operating cities, contact person, and compliance details.
            </p>
          </div>

          {pendingNgos.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No pending NGO applications</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All submitted NGO registrations have been reviewed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingNgos.map((ngo) => (
                <div key={ngo.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                        Pending Verification
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{ngo.orgName || ngo.name}</h3>
                      <p className="text-xs text-slate-500">
                        Contact Person: {ngo.contactPerson || ngo.name} · Phone: {ngo.phone || 'Not provided'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleNgoDecision(ngo.id, 'verified')}
                        disabled={verifyingId === ngo.id}
                        className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition disabled:opacity-50"
                      >
                        Approve & Verify NGO
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNgoDecision(ngo.id, 'rejected')}
                        disabled={verifyingId === ngo.id}
                        className="px-3.5 py-2 bg-slate-100 text-red-700 text-xs font-bold rounded-xl hover:bg-red-50 border border-red-200 transition disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Operating City</span>
                      <strong className="text-slate-800">{ngo.operatingCity || ngo.city}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Registration Number</span>
                      <strong className="text-slate-800">{ngo.regNumber || 'Not declared'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Declared Support Areas</span>
                      <strong className="text-slate-800">{ngo.areasOfSupport?.join(', ') || 'General relief'}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VOLUNTEER VERIFICATIONS SUBTAB */}
      {activeSubTab === 'volunteer-verifications' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Volunteer Verification Queue</h2>
            <p className="text-xs text-slate-500">
              Review volunteer profiles, skills, availability, and background details before granting field privileges.
            </p>
          </div>

          {pendingVolunteers.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No pending volunteer applications</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All submitted volunteer accounts have been reviewed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingVolunteers.map((vol) => (
                <div key={vol.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                        Pending Review
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{vol.name}</h3>
                      <p className="text-xs text-slate-500">
                        City: {vol.city} {vol.locality ? `(${vol.locality})` : ''} · Phone: {vol.phone || 'Not provided'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleVolunteerDecision(vol.id, 'verified')}
                        disabled={verifyingId === vol.id}
                        className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition disabled:opacity-50"
                      >
                        Approve & Verify Volunteer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVolunteerDecision(vol.id, 'rejected')}
                        disabled={verifyingId === vol.id}
                        className="px-3.5 py-2 bg-slate-100 text-red-700 text-xs font-bold rounded-xl hover:bg-red-50 border border-red-200 transition disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Skills & Capabilities</span>
                      <strong className="text-slate-800">{vol.skills || 'General field support'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Available Days</span>
                      <strong className="text-slate-800">{vol.availableDays || 'Flexible'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Areas of Interest</span>
                      <strong className="text-slate-800">{vol.areasOfSupport?.join(', ') || 'All categories'}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REQUESTS MONITOR SUBTAB */}
      {activeSubTab === 'requests-monitor' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Platform-wide Support Requests Monitor</h2>
              <p className="text-xs text-slate-500">Oversee all requests across all cities, NGOs, and volunteers</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, city, category, beneficiary, NGO..."
                className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-lg border border-slate-200"
            >
              <option value="">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="in_progress">In Progress</option>
              <option value="awaiting_beneficiary_verification">Awaiting Beneficiary</option>
              <option value="verified_completed">Verified Completed</option>
              <option value="partially_completed">Partially Completed</option>
              <option value="beneficiary_reported_issue">Beneficiary Reported Issue</option>
              <option value="resolved">Resolved</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredRequests.map((req) => {
              const badge = getStatusBadgeInfo(req.status)
              const urgencyBadge = getUrgencyBadgeInfo(req.urgency)

              return (
                <div key={req.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ background: urgencyBadge.bg, color: urgencyBadge.color }}
                        >
                          {urgencyBadge.label}
                        </span>
                        <span className="text-xs text-slate-400">{formatDateTime(req.createdAt)}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1.5">{req.title || req.category}</h3>
                      <p className="text-xs text-slate-600 mt-0.5">{req.description}</p>
                    </div>

                    {req.status === 'beneficiary_reported_issue' && (
                      <button
                        type="button"
                        onClick={() => setResolvingReq(req)}
                        className="px-3.5 py-1.5 bg-red-700 text-white text-xs font-bold rounded-xl hover:bg-red-800"
                      >
                        Intervene & Resolve
                      </button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Beneficiary: <strong className="text-slate-800">{req.seekerName}</strong></span>
                    <span>City: <strong className="text-slate-800">{req.city}</strong></span>
                    <span>Assigned NGO: <strong className="text-slate-800">{req.assignedNgoName || 'Unassigned'}</strong></span>
                    <span>Volunteer: <strong className="text-slate-800">{req.assignedVolunteerName || 'Unassigned'}</strong></span>
                  </div>

                  {req.completionReport && (
                    <div className="p-2.5 bg-emerald-50 rounded-xl text-xs text-emerald-950">
                      <strong>Completion Report:</strong> {req.completionReport}
                    </div>
                  )}

                  {req.resolutionNotes && (
                    <div className="p-2.5 bg-teal-50 rounded-xl text-xs text-teal-950">
                      <strong>Resolution:</strong> {req.resolutionNotes}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* DISPUTES SUBTAB */}
      {activeSubTab === 'disputes' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Escalated Beneficiary Disputes</h2>
            <p className="text-xs text-slate-500">
              Active complaints filed by beneficiaries regarding unreceived, partial, or problematic deliveries.
            </p>
          </div>

          {openDisputes.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No active disputes</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All beneficiary issues have been investigated and closed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {openDisputes.map((req) => (
                <div key={req.id} className="bg-white p-5 rounded-2xl border-2 border-red-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                        Dispute: {req.issueType || 'Delivery Issue'}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{req.title || req.category}</h3>
                      <p className="text-xs text-red-900 mt-1 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                        "{req.issueDetails || 'No details provided'}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setResolvingReq(req)}
                      className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-xl hover:bg-red-800"
                    >
                      Record Resolution
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Beneficiary: <strong className="text-slate-800">{req.seekerName}</strong> ({req.seekerPhone || 'No phone'})</span>
                    <span>Assigned NGO: <strong className="text-slate-800">{req.assignedNgoName || 'None'}</strong></span>
                    <span>Volunteer: <strong className="text-slate-800">{req.assignedVolunteerName || 'None'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EMERGENCIES SUBTAB */}
      {activeSubTab === 'emergencies' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Emergency Operations Center</h2>
            <p className="text-xs text-slate-500">
              Active location alerts submitted by community members. Coordinate emergency responders.
            </p>
          </div>

          {emergencyAlerts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No active emergency alerts</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All submitted emergency alerts have expired or been resolved.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {emergencyAlerts.map((alert) => (
                <div key={alert.id} className="bg-white p-5 rounded-2xl border-2 border-red-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                        Active Alert · Expires {getRelativeTime(alert.expiresAt)}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">
                        Coordinates: {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                        {alert.accuracy !== undefined && ` (±${alert.accuracy}m)`}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Alert logged on {formatDateTime(alert.createdAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setManagingAlertId(alert.id)
                        setSelectedResponders(alert.authorizedResponderIds ?? [])
                      }}
                      className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-xl hover:bg-red-800"
                    >
                      Assign Responders ({alert.authorizedResponderIds?.length ?? 0})
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <strong className="text-slate-700">Authorized Responders:</strong>{' '}
                    {alert.authorizedResponderIds && alert.authorizedResponderIds.length > 0
                      ? `${alert.authorizedResponderIds.length} verified responders authorized`
                      : 'None authorized yet'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AUDIT LOGS SUBTAB */}
      {activeSubTab === 'audit-logs' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Security Audit Trail</h2>
            <p className="text-xs text-slate-500">
              Tamper-evident record of security-critical state changes, verifications, and assignment mutations.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="divide-y divide-slate-100">
              {auditEvents.map((event) => (
                <div key={event.id} className="p-3.5 sm:p-4 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                        {event.action}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 font-medium capitalize">
                        Actor: {event.actorRole}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">
                        Target: {event.targetType} ({event.targetId.slice(-6)})
                      </span>
                    </div>
                    {event.fromStatus && event.toStatus && (
                      <p className="text-[11px] text-slate-500">
                        Status Transition: <code className="text-slate-700">{event.fromStatus}</code> →{' '}
                        <code className="text-slate-700">{event.toStatus}</code>
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">{formatDateTime(event.createdAt)}</span>
                    <span className="text-[10px] text-emerald-700 font-bold capitalize">{event.outcome}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* RESPONDERS ASSIGNMENT MODAL */}
      {managingAlertId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Authorize Emergency Responders</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Grant verified NGOs or volunteers permission to view emergency coordinates.
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableResponders.map((resp) => {
                const checked = selectedResponders.includes(resp.id)
                return (
                  <label
                    key={resp.id}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                      checked ? 'border-emerald-600 bg-emerald-50 text-emerald-950' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedResponders([...selectedResponders, resp.id])
                        } else {
                          setSelectedResponders(selectedResponders.filter((id) => id !== resp.id))
                        }
                      }}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>{resp.name}</span>
                  </label>
                )
              })}
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setManagingAlertId(null)}
                className="px-3 py-1.5 text-xs text-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveResponders}
                disabled={savingResponders}
                className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 disabled:opacity-50"
              >
                {savingResponders ? 'Saving…' : 'Save Responders'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN DISPUTE RESOLUTION MODAL */}
      {resolvingReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-red-700 uppercase tracking-wider">
                Admin Dispute Resolution
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Resolve Complaint: {resolvingReq.title || resolvingReq.category}
              </h3>
            </div>

            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs">
              <strong className="text-red-950 block">Beneficiary Complaint:</strong>
              <p className="text-red-900 mt-0.5">"{resolvingReq.issueDetails}"</p>
            </div>

            <form onSubmit={handleAdminResolveSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Administrator Resolution Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={adminResolutionNotes}
                  onChange={(e) => setAdminResolutionNotes(e.target.value)}
                  placeholder="Record administrative findings, directives issued to NGO, and outcome..."
                  rows={4}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResolvingReq(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution}
                  className="px-5 py-2 bg-emerald-700 text-white font-bold text-xs rounded-xl hover:bg-emerald-800 disabled:opacity-50"
                >
                  {submittingResolution ? 'Saving…' : 'Resolve & Close Dispute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
