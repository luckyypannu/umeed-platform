'use client'

import { useState } from 'react'
import {
  Building2,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlusCircle,
  Briefcase,
  UserCheck,
  Send,
  MapPin,
  ChevronRight,
  Filter,
  Search,
  ShieldAlert,
  ArrowRight,
  Check,
  XCircle,
  FileText,
  Star,
  Activity,
  BarChart3,
  TrendingUp,
} from 'lucide-react'
import type {
  HelpRequest,
  NotificationItem,
  OpportunityApplicant,
  PublicVolunteerProfile,
  SafeUser,
  VolunteerOpportunity,
  ImpactStats,
} from '../../lib/types'
import {
  getStatusBadgeInfo,
  getUrgencyBadgeInfo,
  formatDateTime,
  getRelativeTime,
  maskContactDetail,
} from '../../lib/dashboard-helpers'
import { categories } from '../../lib/categories'

export default function NgoDashboard({
  user,
  requests,
  opportunities,
  opportunityApplicants,
  availableVolunteers,
  impactStats,
  notifications,
  onRefresh,
  onAcceptRequest,
  onAssignVolunteer,
  onUpdateRequestStatus,
  onResolveDispute,
  onCreateOpportunity,
  onAcceptApplicant,
  onLoadApplicants,
  onUpdateProfile,
  onNavigateTab,
}: {
  user: SafeUser
  requests: HelpRequest[]
  opportunities: VolunteerOpportunity[]
  opportunityApplicants: Record<string, OpportunityApplicant[]>
  availableVolunteers: PublicVolunteerProfile[]
  impactStats: ImpactStats | null
  notifications: NotificationItem[]
  onRefresh: () => void
  onAcceptRequest: (requestId: string) => Promise<void>
  onAssignVolunteer: (requestId: string, volunteerId: string) => Promise<void>
  onUpdateRequestStatus: (requestId: string, status: string, note?: string) => Promise<void>
  onResolveDispute: (requestId: string, resolutionNotes: string, status: 'resolved' | 'needs_follow_up') => Promise<void>
  onCreateOpportunity: (data: {
    title: string
    category: string
    mode: 'In-person' | 'Remote'
    city: string
    description: string
  }) => Promise<void>
  onAcceptApplicant: (opportunityId: string, volunteerId: string) => Promise<void>
  onLoadApplicants: (opportunityId: string) => Promise<void>
  onUpdateProfile: (updates: Partial<SafeUser>) => Promise<void>
  onNavigateTab: (tab: string) => void
}) {
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'incoming' | 'assigned' | 'disputes' | 'volunteers' | 'opportunities' | 'profile'
  >('overview')

  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null)
  const [assigningReqId, setAssigningReqId] = useState<string | null>(null)
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('')
  const [submittingAssign, setSubmittingAssign] = useState(false)

  // Dispute resolution modal
  const [resolvingDisputeReq, setResolvingDisputeReq] = useState<HelpRequest | null>(null)
  const [disputeResolutionNotes, setDisputeResolutionNotes] = useState('')
  const [disputeOutcomeStatus, setDisputeOutcomeStatus] = useState<'resolved' | 'needs_follow_up'>('resolved')
  const [submittingResolution, setSubmittingResolution] = useState(false)

  // Opportunity creation form
  const [creatingOp, setCreatingOp] = useState(false)
  const [opTitle, setOpTitle] = useState('')
  const [opCategory, setOpCategory] = useState<string>(categories[0].label)
  const [opMode, setOpMode] = useState<'In-person' | 'Remote'>('In-person')
  const [opCity, setOpCity] = useState(user.operatingCity || user.city || '')
  const [opDescription, setOpDescription] = useState('')
  const [opSuccessMsg, setOpSuccessMsg] = useState('')
  const [opErrorMsg, setOpErrorMsg] = useState('')
  const [viewingApplicantsOpId, setViewingApplicantsOpId] = useState<string | null>(null)

  // Profile
  const [orgName, setOrgName] = useState(user.orgName || user.name || '')
  const [operatingCity, setOperatingCity] = useState(user.operatingCity || user.city || '')
  const [contactPerson, setContactPerson] = useState(user.contactPerson || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [areasOfSupport, setAreasOfSupport] = useState(user.areasOfSupport?.join(', ') || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('')

  // Search & Filters
  const [requestSearch, setRequestSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const isVerified = user.status === 'verified'

  // Partition requests
  const incomingRequests = requests.filter(
    (r) => !r.assignedNgoId && ['submitted', 'under_review'].includes(r.status),
  )
  const myAssignedRequests = requests.filter(
    (r) => r.assignedNgoId === user.id && !['resolved', 'cancelled'].includes(r.status),
  )
  const disputeRequests = requests.filter(
    (r) => r.assignedNgoId === user.id && r.status === 'beneficiary_reported_issue',
  )
  const awaitingBeneficiaryRequests = requests.filter(
    (r) => r.assignedNgoId === user.id && r.status === 'awaiting_beneficiary_verification',
  )
  const completedRequests = requests.filter(
    (r) => r.assignedNgoId === user.id && ['verified_completed', 'resolved'].includes(r.status),
  )

  const handleAssignVolunteerSubmit = async () => {
    if (!assigningReqId || !selectedVolunteerId) return
    setSubmittingAssign(true)
    try {
      await onAssignVolunteer(assigningReqId, selectedVolunteerId)
      setAssigningReqId(null)
      setSelectedVolunteerId('')
    } finally {
      setSubmittingAssign(false)
    }
  }

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolvingDisputeReq || !disputeResolutionNotes.trim()) return
    setSubmittingResolution(true)
    try {
      await onResolveDispute(resolvingDisputeReq.id, disputeResolutionNotes.trim(), disputeOutcomeStatus)
      setResolvingDisputeReq(null)
      setDisputeResolutionNotes('')
    } finally {
      setSubmittingResolution(false)
    }
  }

  const handleCreateOpportunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!opTitle.trim() || !opDescription.trim() || !opCity.trim()) {
      setOpErrorMsg('Please fill in all opportunity fields.')
      return
    }
    setCreatingOp(true)
    setOpErrorMsg('')
    setOpSuccessMsg('')
    try {
      await onCreateOpportunity({
        title: opTitle.trim(),
        category: opCategory,
        mode: opMode,
        city: opCity.trim(),
        description: opDescription.trim(),
      })
      setOpSuccessMsg('Opportunity published! Verified volunteers can now apply.')
      setOpTitle('')
      setOpDescription('')
      setTimeout(() => setOpSuccessMsg(''), 3000)
    } catch (err: any) {
      setOpErrorMsg(err.message || 'Failed to publish opportunity.')
    } finally {
      setCreatingOp(false)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSuccessMsg('')
    try {
      await onUpdateProfile({
        orgName: orgName.trim(),
        operatingCity: operatingCity.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        areasOfSupport: areasOfSupport.split(',').map((s) => s.trim()).filter(Boolean),
      })
      setProfileSuccessMsg('Organization profile updated!')
      setTimeout(() => setProfileSuccessMsg(''), 3000)
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Verification Notice */}
      {!isVerified && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs sm:text-sm flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">NGO Verification Pending Administrator Review</strong>
            <p className="mt-0.5 text-xs text-amber-800">
              Your organization account is undergoing compliance verification. While pending, you can review
              incoming community requests in your operating city. Full assignment permissions will unlock upon verification.
            </p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 text-white p-6 sm:p-8 rounded-2xl shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-800 text-emerald-200 border border-emerald-700">
                <Building2 className="w-3.5 h-3.5" /> {isVerified ? 'Verified Partner NGO' : 'Pending Verification'}
              </span>
              <span className="text-xs text-emerald-300">
                Operating in {user.operatingCity || user.city}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {user.orgName || user.name} Operational Command
            </h1>
            <p className="text-emerald-100/90 text-xs sm:text-sm mt-1 leading-relaxed">
              Accept eligible community requests, mobilize verified volunteers, resolve delivery disputes,
              and coordinate local humanitarian impact.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('incoming')}
              className="px-4 py-2.5 bg-amber-400 text-emerald-950 font-bold text-xs sm:text-sm rounded-xl hover:bg-amber-300 transition shadow"
            >
              Incoming Requests ({incomingRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('opportunities')}
              className="px-4 py-2.5 bg-emerald-800/80 text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 border border-emerald-600/50 transition"
            >
              Post Opportunity
            </button>
          </div>
        </div>
      </div>

      {/* Active Dispute Alert Banner */}
      {disputeRequests.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 p-4 sm:p-5 rounded-2xl shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 text-red-800 rounded-lg">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-red-950">
                Action Required: {disputeRequests.length} Beneficiary Issue Report{disputeRequests.length > 1 ? 's' : ''}
              </h3>
              <p className="text-xs sm:text-sm text-red-800 mt-1">
                A beneficiary reported a delivery issue or concern. Investigate the matter, record resolution notes,
                and re-schedule support or mark resolved.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {disputeRequests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setResolvingDisputeReq(r)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 transition"
                  >
                    Investigate "{r.title || r.category}" <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
          Operations Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('incoming')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'incoming'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Incoming Eligible Requests
          {incomingRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
              {incomingRequests.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('assigned')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'assigned'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Assigned to Us ({myAssignedRequests.length})
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
          Disputes & Follow-ups
          {disputeRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-900">
              {disputeRequests.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('volunteers')}
          className={`pb-3 border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'volunteers'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Field Volunteers ({availableVolunteers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('opportunities')}
          className={`pb-3 border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'opportunities'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Opportunities & Applicants ({opportunities.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('profile')}
          className={`pb-3 border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'profile'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Organization Profile
        </button>
      </div>

      {/* OVERVIEW SUBTAB */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Real Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Incoming Eligible
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{incomingRequests.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-sky-700 font-medium flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" /> Active in Progress
              </span>
              <p className="text-2xl font-bold text-sky-900 mt-1">
                {myAssignedRequests.filter((r) => r.status === 'in_progress').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Pending Beneficiary
              </span>
              <p className="text-2xl font-bold text-amber-900 mt-1">{awaitingBeneficiaryRequests.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Completed Deliveries
              </span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{completedRequests.length}</p>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
              <span className="text-slate-400 block text-[11px]">Assigned to Us</span>
              <strong className="text-base text-slate-800 font-bold">{myAssignedRequests.length} total</strong>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
              <span className="text-slate-400 block text-[11px]">Open Disputes</span>
              <strong className="text-base text-red-700 font-bold">{disputeRequests.length} cases</strong>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
              <span className="text-slate-400 block text-[11px]">Available Volunteers</span>
              <strong className="text-base text-slate-800 font-bold">{availableVolunteers.length} active</strong>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
              <span className="text-slate-400 block text-[11px]">Published Opportunities</span>
              <strong className="text-base text-slate-800 font-bold">{opportunities.length} open</strong>
            </div>
          </div>

          {/* Quick Incoming Requests list */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">New Eligible Requests in {user.operatingCity || user.city}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Community requests matching your location and support categories</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('incoming')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
              >
                View all ({incomingRequests.length}) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No unassigned requests in your city at this time. All caught up!
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {incomingRequests.slice(0, 4).map((req) => {
                  const urgencyBadge = getUrgencyBadgeInfo(req.urgency)
                  return (
                    <div key={req.id} className="p-4 sm:p-5 hover:bg-slate-50/60 transition flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            {req.category}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                            style={{ background: urgencyBadge.bg, color: urgencyBadge.color }}
                          >
                            {urgencyBadge.label}
                          </span>
                          <span className="text-xs text-slate-400">{getRelativeTime(req.createdAt)}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1">{req.title || req.category}</h4>
                        <p className="text-xs text-slate-600 line-clamp-1 max-w-lg mt-0.5">{req.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAcceptRequest(req.id)}
                        disabled={!isVerified}
                        className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
                      >
                        Accept & Coordinate
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INCOMING REQUESTS SUBTAB */}
      {activeSubTab === 'incoming' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Incoming Support Requests</h2>
            <p className="text-xs text-slate-500">
              Unassigned community requests matching your operating city ({user.operatingCity || user.city}).
              Accept eligible cases to assign volunteers and monitor fulfillment.
            </p>
          </div>

          {incomingRequests.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No unassigned requests</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All requests in your operating city have been claimed or assigned. Check back later for new submissions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingRequests.map((req) => {
                const badge = getStatusBadgeInfo(req.status)
                const urgencyBadge = getUrgencyBadgeInfo(req.urgency)

                return (
                  <div key={req.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            {req.category}
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
                        <p className="text-xs text-slate-600 mt-1">{req.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAcceptRequest(req.id)}
                        disabled={!isVerified}
                        className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
                      >
                        Accept Request & Coordinate
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span>
                        City: <strong className="text-slate-800">{req.city} {req.locality ? `(${req.locality})` : ''}</strong>
                      </span>
                      <span>
                        Beneficiary: <strong className="text-slate-800">{req.seekerName}</strong>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ASSIGNED TO US SUBTAB */}
      {activeSubTab === 'assigned' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Requests Assigned to Your Organization</h2>
            <p className="text-xs text-slate-500">
              Assign verified volunteers, monitor fulfillment progress, and view completion reports.
            </p>
          </div>

          {myAssignedRequests.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No assigned requests</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Accept requests from the incoming tab to begin coordinating relief.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAssignedRequests.map((req) => {
                const badge = getStatusBadgeInfo(req.status)
                const urgencyBadge = getUrgencyBadgeInfo(req.urgency)
                const hasVolunteer = !!req.assignedVolunteerId

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
                        <p className="text-xs text-slate-600 mt-1">{req.description}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {!hasVolunteer && (
                          <button
                            type="button"
                            onClick={() => {
                              setAssigningReqId(req.id)
                              setSelectedVolunteerId('')
                            }}
                            className="px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition"
                          >
                            Assign Volunteer
                          </button>
                        )}
                        {req.status === 'under_review' && hasVolunteer && (
                          <button
                            type="button"
                            onClick={() => onUpdateRequestStatus(req.id, 'in_progress', 'NGO marked task work as started.')}
                            className="px-3.5 py-1.5 bg-sky-700 text-white text-xs font-bold rounded-xl hover:bg-sky-800 transition"
                          >
                            Mark In Progress
                          </button>
                        )}
                        {['verified_completed', 'partially_completed'].includes(req.status) && (
                          <button
                            type="button"
                            onClick={() => onUpdateRequestStatus(req.id, 'resolved', 'NGO closed verified request.')}
                            className="px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition shadow-xs"
                          >
                            Close & Resolve Request
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata & Coordinator Info */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Beneficiary Contact</span>
                        <strong className="text-slate-800 font-semibold">{req.seekerName} ({req.seekerPhone || 'No phone'})</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Assigned Volunteer</span>
                        <strong className="text-slate-800 font-semibold">{req.assignedVolunteerName || 'None assigned yet'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Delivery Location</span>
                        <strong className="text-slate-800 font-semibold">{req.city} {req.locality ? `(${req.locality})` : ''}</strong>
                      </div>
                    </div>

                    {/* Completion Report Preview */}
                    {req.completionReport && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                        <span className="font-bold text-emerald-950 block">Volunteer Completion Report:</span>
                        <p className="text-emerald-900">{req.completionReport}</p>
                        {req.status === 'awaiting_beneficiary_verification' && (
                          <span className="text-[11px] text-amber-700 font-semibold block mt-1">
                            ⏳ Beneficiary has been notified to verify receipt of assistance.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* DISPUTES SUBTAB */}
      {activeSubTab === 'disputes' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Disputes & Beneficiary Issue Resolution</h2>
            <p className="text-xs text-slate-500">
              Investigate reports of missing items, partial deliveries, or concerns filed by beneficiaries.
            </p>
          </div>

          {disputeRequests.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No active disputes</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All assigned deliveries are running smoothly without unresolved issues.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {disputeRequests.map((req) => (
                <div key={req.id} className="bg-white p-5 rounded-2xl border-2 border-red-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                        Issue: {req.issueType || 'Delivery Concern'}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{req.title || req.category}</h3>
                      <p className="text-xs text-red-900 mt-1 font-medium bg-red-50 p-2.5 rounded-xl border border-red-100">
                        "{req.issueDetails || 'No details provided'}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setResolvingDisputeReq(req)}
                      className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-xl hover:bg-red-800 transition shadow-xs"
                    >
                      Investigate & Resolve
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Beneficiary: <strong className="text-slate-800">{req.seekerName}</strong> ({req.seekerPhone || 'No phone'})</span>
                    <span>Volunteer: <strong className="text-slate-800">{req.assignedVolunteerName || 'Unassigned'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VOLUNTEERS SUBTAB */}
      {activeSubTab === 'volunteers' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Verified Field Volunteers Directory</h2>
            <p className="text-xs text-slate-500">
              Browse available verified volunteers in your area to assign to incoming relief cases.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {availableVolunteers.map((vol) => (
              <div key={vol.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{vol.name}</h4>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {vol.city}
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-emerald-700 font-semibold">Verified Volunteer</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OPPORTUNITIES SUBTAB */}
      {activeSubTab === 'opportunities' && (
        <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs max-w-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Create Volunteer Opportunity</h3>
            <p className="text-xs text-slate-500 mb-4">
              Publish structured field or remote initiatives that verified volunteers can apply for.
            </p>

            {opErrorMsg && (
              <div className="mb-3 p-3 bg-red-50 text-red-800 text-xs rounded-xl">{opErrorMsg}</div>
            )}
            {opSuccessMsg && (
              <div className="mb-3 p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl">{opSuccessMsg}</div>
            )}

            <form onSubmit={handleCreateOpportunitySubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Title</label>
                <input
                  type="text"
                  value={opTitle}
                  onChange={(e) => setOpTitle(e.target.value)}
                  placeholder="e.g. Weekend Food Distribution Drive"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={opCategory}
                    onChange={(e) => setOpCategory(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.label}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Mode</label>
                  <select
                    value={opMode}
                    onChange={(e) => setOpMode(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <option value="In-person">In-person</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={opCity}
                    onChange={(e) => setOpCity(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description & Requirements</label>
                <textarea
                  value={opDescription}
                  onChange={(e) => setOpDescription(e.target.value)}
                  placeholder="Describe the initiative, volunteer roles, dates, and requirements..."
                  rows={3}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={creatingOp || !isVerified}
                  className="px-5 py-2.5 bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 transition disabled:opacity-50"
                >
                  {creatingOp ? 'Publishing…' : 'Publish Opportunity'}
                </button>
              </div>
            </form>
          </div>

          {/* List of Published Opportunities */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900">Your Published Opportunities</h3>
            {opportunities.length === 0 ? (
              <p className="text-xs text-slate-500">No opportunities published yet.</p>
            ) : (
              opportunities.map((op) => {
                const applicants = opportunityApplicants[op.id] ?? []
                const isViewing = viewingApplicantsOpId === op.id

                return (
                  <div key={op.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            {op.category}
                          </span>
                          <span className="text-xs text-slate-400">
                            {op.mode} · {op.city}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-1">{op.title}</h4>
                        <p className="text-xs text-slate-600 mt-0.5">{op.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isViewing) {
                            setViewingApplicantsOpId(null)
                          } else {
                            setViewingApplicantsOpId(op.id)
                            onLoadApplicants(op.id)
                          }
                        }}
                        className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      >
                        {isViewing ? 'Hide Applicants' : `View Applicants (${op.applicantCount})`}
                      </button>
                    </div>

                    {/* Applicants roster accordion */}
                    {isViewing && (
                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <h5 className="text-xs font-bold text-slate-700">Applicant Roster:</h5>
                        {applicants.length === 0 ? (
                          <p className="text-xs text-slate-400">No applicants yet for this opportunity.</p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {applicants.map((app) => (
                              <div
                                key={app.volunteerId}
                                className="py-2 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <strong className="text-slate-800 font-semibold">{app.name}</strong>
                                  <span className="text-slate-400 ml-2">({app.city})</span>
                                </div>
                                <div>
                                  {app.status === 'accepted' ? (
                                    <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => onAcceptApplicant(op.id, app.volunteerId)}
                                      className="px-3 py-1 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800"
                                    >
                                      Accept Volunteer
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* PROFILE SUBTAB */}
      {activeSubTab === 'profile' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Organization Profile</h2>
          <p className="text-xs text-slate-500 mb-4">
            Manage your organization's legal name, operating cities, contact person, and areas of support.
          </p>

          {profileSuccessMsg && (
            <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl">{profileSuccessMsg}</div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Operating City</label>
                <input
                  type="text"
                  value={operatingCity}
                  onChange={(e) => setOperatingCity(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Primary Contact Person</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Areas of Support</label>
              <input
                type="text"
                value={areasOfSupport}
                onChange={(e) => setAreasOfSupport(e.target.value)}
                placeholder={categories.slice(0, 3).map((category) => category.label).join(', ')}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
              <span className="text-[11px] text-slate-400">Separate multiple categories with commas</span>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 transition disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save Organization Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ASSIGN VOLUNTEER MODAL */}
      {assigningReqId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Assign Field Volunteer</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select a verified volunteer to coordinate assistance for this beneficiary.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Available Volunteers</label>
              {availableVolunteers.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                  No verified volunteers currently available in directory.
                </p>
              ) : (
                <select
                  value={selectedVolunteerId}
                  onChange={(e) => setSelectedVolunteerId(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200"
                >
                  <option value="">Select a verified volunteer...</option>
                  {availableVolunteers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.city})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssigningReqId(null)}
                className="px-3 py-1.5 text-xs text-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignVolunteerSubmit}
                disabled={!selectedVolunteerId || submittingAssign}
                className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 disabled:opacity-50"
              >
                {submittingAssign ? 'Assigning…' : 'Confirm Volunteer Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPUTE RESOLUTION MODAL */}
      {resolvingDisputeReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-red-700 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" /> Dispute Investigation
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Resolve Concern: {resolvingDisputeReq.title || resolvingDisputeReq.category}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Reported by: {resolvingDisputeReq.seekerName} · Phone: {resolvingDisputeReq.seekerPhone || 'Not provided'}
              </p>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-red-950 block">Beneficiary Complaint:</span>
              <p className="text-red-900">"{resolvingDisputeReq.issueDetails || 'No details provided'}"</p>
            </div>

            <form onSubmit={handleDisputeSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Resolution Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDisputeOutcomeStatus('resolved')}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition ${
                      disputeOutcomeStatus === 'resolved'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Resolved & Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisputeOutcomeStatus('needs_follow_up')}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition ${
                      disputeOutcomeStatus === 'needs_follow_up'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-xs'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Re-open for Follow-up
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Investigation & Resolution Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={disputeResolutionNotes}
                  onChange={(e) => setDisputeResolutionNotes(e.target.value)}
                  placeholder="Record your findings, actions taken (e.g. replacement ration sent, volunteer contacted), and resolution details..."
                  rows={4}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResolvingDisputeReq(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution}
                  className="px-5 py-2 bg-emerald-700 text-white font-bold text-xs rounded-xl hover:bg-emerald-800 disabled:opacity-50"
                >
                  {submittingResolution ? 'Saving…' : 'Record Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
