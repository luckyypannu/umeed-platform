'use client'

import { useState } from 'react'
import {
  HeartHandshake,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Star,
  MapPin,
  Building2,
  UserCheck,
  Send,
  XCircle,
  Edit3,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  MessageSquare,
  ChevronRight,
  Calendar,
} from 'lucide-react'
import type { HelpRequest, NotificationItem, SafeUser } from '../../lib/types'
import {
  getRequestProgress,
  getStatusBadgeInfo,
  getUrgencyBadgeInfo,
  getRequestTimeline,
  formatDateTime,
  getRelativeTime,
  maskContactDetail,
} from '../../lib/dashboard-helpers'
import { categories } from '../../lib/categories'

export default function SeekerDashboard({
  user,
  requests,
  notifications,
  onRefresh,
  onCreateRequest,
  onUpdateRequest,
  onCancelRequest,
  onConfirmDelivery,
  onReportIssue,
  onRateVolunteer,
  onNavigateTab,
}: {
  user: SafeUser
  requests: HelpRequest[]
  notifications: NotificationItem[]
  onRefresh: () => void
  onCreateRequest: (data: {
    category: string
    description: string
    city: string
    locality?: string
    urgency: string
    title?: string
    phone?: string
  }) => Promise<void>
  onUpdateRequest: (id: string, updates: Partial<HelpRequest>) => Promise<void>
  onCancelRequest: (id: string) => Promise<void>
  onConfirmDelivery: (
    request: HelpRequest,
    outcome: 'fully-delivered' | 'partially-delivered' | 'not-delivered',
    data: { rating?: number; explanation?: string; feedback?: string; issueType?: string },
  ) => Promise<void>
  onReportIssue: (request: HelpRequest, issueType: string, issueDetails: string) => Promise<void>
  onRateVolunteer: (request: HelpRequest, rating: number) => Promise<void>
  onNavigateTab: (tab: string) => void
}) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'new-request' | 'my-requests'>('overview')
  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null)
  const [editingRequest, setEditingRequest] = useState<HelpRequest | null>(null)
  const [confirmingRequest, setConfirmingRequest] = useState<HelpRequest | null>(null)
  const [reportingIssueRequest, setReportingIssueRequest] = useState<HelpRequest | null>(null)

  // New Request Form State
  const [newCategory, setNewCategory] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCity, setNewCity] = useState(user.city || '')
  const [newLocality, setNewLocality] = useState(user.locality || '')
  const [newUrgency, setNewUrgency] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [newPhone, setNewPhone] = useState(user.phone || '')
  const [submittingNew, setSubmittingNew] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Confirmation modal state
  const [confirmOutcome, setConfirmOutcome] = useState<'fully-delivered' | 'partially-delivered' | 'not-delivered'>('fully-delivered')
  const [confirmRating, setConfirmRating] = useState(5)
  const [confirmExplanation, setConfirmExplanation] = useState('')
  const [confirmFeedback, setConfirmFeedback] = useState('')
  const [submittingConfirm, setSubmittingConfirm] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  // Issue reporting modal state
  const [issueCategory, setIssueCategory] = useState('delivery_not_received')
  const [issueDescription, setIssueDescription] = useState('')
  const [submittingIssue, setSubmittingIssue] = useState(false)
  const [issueError, setIssueError] = useState('')

  // Rating on completed request
  const [submittingRating, setSubmittingRating] = useState(false)

  // Filtered requests
  const activeRequests = requests.filter((r) => !['resolved', 'cancelled'].includes(r.status))
  const completedRequests = requests.filter((r) => ['resolved', 'verified_completed'].includes(r.status))
  const awaitingVerification = requests.filter((r) => r.status === 'awaiting_beneficiary_verification')

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategory) {
      setFormError('Please select a support category.')
      return
    }
    if (!newDescription.trim() || newDescription.trim().length < 10) {
      setFormError('Please provide a brief description (at least 10 characters).')
      return
    }
    if (!newCity.trim()) {
      setFormError('Please enter your city.')
      return
    }
    setSubmittingNew(true)
    setFormError('')
    setFormSuccess('')
    try {
      await onCreateRequest({
        category: newCategory,
        title: newTitle.trim() || undefined,
        description: newDescription.trim(),
        city: newCity.trim(),
        locality: newLocality.trim() || undefined,
        urgency: newUrgency,
        phone: newPhone.trim() || undefined,
      })
      setFormSuccess('Your request has been submitted successfully!')
      setNewCategory('')
      setNewTitle('')
      setNewDescription('')
      setTimeout(() => {
        setFormSuccess('')
        setActiveSubTab('my-requests')
      }, 1500)
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit request. Please try again.')
    } finally {
      setSubmittingNew(false)
    }
  }

  const handleConfirmSubmit = async () => {
    if (!confirmingRequest) return
    if (confirmOutcome !== 'fully-delivered' && !confirmExplanation.trim()) {
      setConfirmError('Please provide an explanation for partial or unfulfilled delivery.')
      return
    }
    setSubmittingConfirm(true)
    setConfirmError('')
    try {
      await onConfirmDelivery(confirmingRequest, confirmOutcome, {
        rating: confirmOutcome === 'fully-delivered' ? confirmRating : undefined,
        explanation: confirmExplanation.trim(),
        feedback: confirmFeedback.trim(),
        issueType: confirmOutcome === 'not-delivered' ? 'delivery_issue' : undefined,
      })
      setConfirmingRequest(null)
      setConfirmExplanation('')
      setConfirmFeedback('')
    } catch (err: any) {
      setConfirmError(err.message || 'Failed to confirm delivery.')
    } finally {
      setSubmittingConfirm(false)
    }
  }

  const handleIssueSubmit = async () => {
    if (!reportingIssueRequest) return
    if (!issueDescription.trim()) {
      setIssueError('Please describe the problem encountered.')
      return
    }
    setSubmittingIssue(true)
    setIssueError('')
    try {
      await onReportIssue(reportingIssueRequest, issueCategory, issueDescription.trim())
      setReportingIssueRequest(null)
      setIssueDescription('')
    } catch (err: any) {
      setIssueError(err.message || 'Failed to report issue.')
    } finally {
      setSubmittingIssue(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white p-6 sm:p-8 rounded-2xl shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-800/80 text-emerald-200 mb-3 border border-emerald-700/50">
            <HeartHandshake className="w-3.5 h-3.5" /> UMEED Community Care
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            Welcome, {user.name}
          </h1>
          <p className="text-emerald-100/90 text-sm sm:text-base leading-relaxed">
            We are here to support you with food, healthcare, education, shelter, and essentials.
            Every request is handled with dignity, privacy, and dedicated care.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveSubTab('new-request')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-400 text-emerald-950 font-bold text-sm rounded-xl hover:bg-amber-300 transition shadow"
            >
              <PlusCircle className="w-4 h-4" /> Request Support Now
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('my-requests')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-800/70 text-white font-medium text-sm rounded-xl hover:bg-emerald-800 border border-emerald-600/50 transition"
            >
              View My Requests ({requests.length})
            </button>
          </div>
        </div>
      </div>

      {/* Action Prompt when delivery verification is pending */}
      {awaitingVerification.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 p-5 rounded-2xl shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-amber-950">
                Action Required: Confirm Delivery for {awaitingVerification.length} Request{awaitingVerification.length > 1 ? 's' : ''}
              </h3>
              <p className="text-xs sm:text-sm text-amber-800 mt-1">
                A volunteer completed their visit! Please verify whether you received the requested assistance
                so we can ensure quality service and properly recognize our volunteers.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {awaitingVerification.map((req) => (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => {
                      setConfirmingRequest(req)
                      setConfirmOutcome('fully-delivered')
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 transition"
                  >
                    Confirm Delivery for "{req.title || req.category}" <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          className={`pb-3 border-b-2 transition ${
            activeSubTab === 'overview'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Overview & Activity
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('my-requests')}
          className={`pb-3 border-b-2 transition flex items-center gap-1.5 ${
            activeSubTab === 'my-requests'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          My Support Requests
          {activeRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {activeRequests.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('new-request')}
          className={`pb-3 border-b-2 transition flex items-center gap-1.5 ${
            activeSubTab === 'new-request'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PlusCircle className="w-4 h-4 text-emerald-700" /> New Request
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Status Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Requests</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{requests.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-sky-700 font-medium">Active in Progress</span>
              <p className="text-2xl font-bold text-sky-900 mt-1">{activeRequests.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-amber-700 font-medium">Pending Confirmation</span>
              <p className="text-2xl font-bold text-amber-900 mt-1">{awaitingVerification.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-emerald-700 font-medium">Completed Deliveries</span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{completedRequests.length}</p>
            </div>
          </div>

          {/* Active Requests Quick List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Active Requests Status</h3>
                <p className="text-xs text-slate-500 mt-0.5">Track your ongoing support and timeline in real-time</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('my-requests')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeRequests.length === 0 ? (
              <div className="p-8 text-center">
                <HeartHandshake className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800">No active requests</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  If you or someone in your community needs assistance with food, medical supplies, or essentials,
                  submit a request anytime.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('new-request')}
                  className="mt-4 px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition"
                >
                  Create Support Request
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeRequests.map((req) => {
                  const badge = getStatusBadgeInfo(req.status)
                  const urgencyBadge = getUrgencyBadgeInfo(req.urgency)
                  const progress = getRequestProgress(req.status)
                  return (
                    <div key={req.id} className="p-4 sm:p-5 hover:bg-slate-50/60 transition">
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
                            <span className="text-xs text-slate-400">
                              {getRelativeTime(req.createdAt)}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 mt-1.5">
                            {req.title || `${req.category} in ${req.city}`}
                          </h4>
                          <p className="text-xs text-slate-600 line-clamp-2 mt-1 max-w-xl">
                            {req.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(req)}
                            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition"
                          >
                            Track Timeline
                          </button>
                          {req.status === 'awaiting_beneficiary_verification' && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingRequest(req)
                                setConfirmOutcome('fully-delivered')
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition shadow-xs"
                            >
                              Confirm Delivery
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3.5">
                        <div className="flex justify-between text-[11px] text-slate-500 font-medium mb-1">
                          <span>Request Lifecycle</span>
                          <span>{progress}% complete</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Partner assignments info */}
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          NGO: <strong className="text-slate-700">{req.assignedNgoName || 'Matching…'}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          Volunteer: <strong className="text-slate-700">{req.assignedVolunteerName || 'Awaiting assignment'}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {req.city} {req.locality ? `(${req.locality})` : ''}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick Support Categories Cards */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-1">Need a specific category of help?</h3>
            <p className="text-xs text-slate-500 mb-4">Click any category to begin a personalized request</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setNewCategory(category.label)
                    setActiveSubTab('new-request')
                  }}
                  className="p-3 text-left border border-slate-200 rounded-xl hover:border-emerald-600 hover:bg-emerald-50/40 transition flex items-center gap-2.5 group"
                >
                  <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition">
                    <HeartHandshake className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{category.label}</span>
                    <span className="text-[10px] text-slate-500">Click to request</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW REQUEST TAB */}
      {activeSubTab === 'new-request' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs max-w-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Create a Support Request</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Provide details of the support you require. Verified NGOs and local volunteers will be matched to coordinate help.
            </p>
          </div>

          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              {formError}
            </div>
          )}

          {formSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {/* Category selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Support Category <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setNewCategory(category.label)}
                    className={`p-2.5 text-xs text-left rounded-xl border flex items-center gap-2 transition ${
                      newCategory === category.label
                        ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                    <span className="truncate">{category.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Request Title (Optional)
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Dry Food Rations for Family of 4"
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                maxLength={160}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Describe What You Need <span className="text-red-500">*</span>
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Please describe the items, medical support, shelter or assistance you require, including family size or any specific requirements."
                rows={4}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                maxLength={5000}
                required
              />
              <span className="text-[11px] text-slate-400">Minimum 10 characters</span>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Urgency Level
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'critical'] as const).map((lvl) => {
                  const b = getUrgencyBadgeInfo(lvl)
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setNewUrgency(lvl)}
                      className={`py-2 text-xs font-bold rounded-xl border capitalize transition ${
                        newUrgency === lvl
                          ? 'border-emerald-700 shadow-xs'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                      style={newUrgency === lvl ? { background: b.bg, color: b.color } : {}}
                    >
                      {lvl}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Location fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="e.g. Mumbai, Delhi, Bengaluru"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Locality / Neighborhood
                </label>
                <input
                  type="text"
                  value={newLocality}
                  onChange={(e) => setNewLocality(e.target.value)}
                  placeholder="e.g. Andheri East, Sector 14"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Contact Phone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Contact Phone for Delivery
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400">
                Your contact information is only shared with the assigned verified volunteer after assignment.
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveSubTab('overview')}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingNew}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 transition shadow disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submittingNew ? 'Submitting…' : 'Submit Support Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MY REQUESTS TAB */}
      {activeSubTab === 'my-requests' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">All Your Support Requests</h2>
              <p className="text-xs text-slate-500">Track status, confirm deliveries, report issues, and view history</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('new-request')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition"
            >
              <PlusCircle className="w-4 h-4" /> New Request
            </button>
          </div>

          {requests.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <HeartHandshake className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No requests yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Whenever you or your family need assistance, submit a request and our community partners will be notified.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('new-request')}
                className="mt-4 px-4 py-2.5 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition"
              >
                Create Request
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const badge = getStatusBadgeInfo(req.status)
                const urgencyBadge = getUrgencyBadgeInfo(req.urgency)
                const canCancel = ['submitted', 'under_review'].includes(req.status)
                const canEdit = req.status === 'submitted'
                const canConfirm = req.status === 'awaiting_beneficiary_verification'
                const canReportIssue = ['in_progress', 'awaiting_beneficiary_verification', 'partially_completed'].includes(req.status)

                return (
                  <div
                    key={req.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition space-y-3"
                  >
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
                          <span className="text-xs text-slate-400">
                            {formatDateTime(req.createdAt)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-1.5">
                          {req.title || `${req.category} in ${req.city}`}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1">{req.description}</p>
                      </div>

                      {/* Top Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedRequest(req)}
                          className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition"
                        >
                          View Timeline
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditingRequest(req)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5 inline mr-1" /> Edit
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Are you sure you want to cancel this request?')) {
                                onCancelRequest(req.id)
                              }
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 rounded-lg transition"
                          >
                            <XCircle className="w-3.5 h-3.5 inline mr-1" /> Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata & Coordinator Info */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span>
                        City: <strong className="text-slate-700">{req.city} {req.locality ? `(${req.locality})` : ''}</strong>
                      </span>
                      <span>
                        Assigned NGO: <strong className="text-slate-700">{req.assignedNgoName || 'Pending'}</strong>
                      </span>
                      <span>
                        Volunteer: <strong className="text-slate-700">{req.assignedVolunteerName || 'Not assigned yet'}</strong>
                      </span>
                      {req.rating && (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {req.rating} / 5 Stars
                        </span>
                      )}
                    </div>

                    {/* Completion Report Preview */}
                    {req.completionReport && (
                      <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs space-y-1">
                        <span className="font-bold text-emerald-950 block">Volunteer Completion Report:</span>
                        <p className="text-emerald-900">{req.completionReport}</p>
                        {req.itemsDelivered && (
                          <p className="text-emerald-800">
                            <strong>Items delivered:</strong> {req.itemsDelivered} {req.quantityDelivered ? `(Qty: ${req.quantityDelivered})` : ''}
                          </p>
                        )}
                        {req.visitDate && (
                          <p className="text-emerald-700 text-[11px]">
                            Visit recorded: {req.visitDate} {req.visitTime || ''}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Resolution Notes Preview */}
                    {req.resolutionNotes && (
                      <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs space-y-1">
                        <span className="font-bold text-teal-950 block">Resolution Summary:</span>
                        <p className="text-teal-900">{req.resolutionNotes}</p>
                        {req.resolvedAt && (
                          <p className="text-teal-700 text-[11px]">Resolved on {formatDateTime(req.resolvedAt)}</p>
                        )}
                      </div>
                    )}

                    {/* Reported Issue Preview */}
                    {req.issueDetails && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
                        <span className="font-bold text-red-950 block flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          Reported Issue ({req.issueType || 'General'}):
                        </span>
                        <p className="text-red-900">{req.issueDetails}</p>
                      </div>
                    )}

                    {/* Action Bar for Delivery Confirmation / Problem Reporting */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {canConfirm ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingRequest(req)
                            setConfirmOutcome('fully-delivered')
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition shadow-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Verify & Confirm Delivery
                        </button>
                      ) : req.beneficiaryConfirmedAt ? (
                        <span className="text-xs text-emerald-800 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Confirmed on {formatDateTime(req.beneficiaryConfirmedAt)}
                        </span>
                      ) : (
                        <span />
                      )}

                      {canReportIssue && (
                        <button
                          type="button"
                          onClick={() => setReportingIssueRequest(req)}
                          className="text-xs text-slate-500 hover:text-red-700 font-medium inline-flex items-center gap-1 transition"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" /> Report an issue or concern
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TIMELINE MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs text-slate-400 font-medium">Request Timeline</span>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedRequest.title || selectedRequest.category}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Timeline Steps */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {getRequestTimeline(selectedRequest).map((step, idx) => (
                <div key={idx} className="relative">
                  <div
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                      step.state === 'complete'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : step.state === 'current'
                        ? 'bg-white border-emerald-600 text-emerald-800 ring-4 ring-emerald-50'
                        : step.state === 'alert'
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-white border-slate-300 text-slate-400'
                    }`}
                  >
                    {step.state === 'complete' ? '✓' : idx + 1}
                  </div>
                  <div>
                    <h4
                      className={`text-sm font-bold ${
                        step.state === 'alert'
                          ? 'text-red-700'
                          : step.state === 'complete' || step.state === 'current'
                          ? 'text-slate-900'
                          : 'text-slate-400'
                      }`}
                    >
                      {step.title}
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">{step.description}</p>
                    {step.date && (
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        {formatDateTime(step.date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELIVERY CONFIRMATION MODAL */}
      {confirmingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Beneficiary Verification
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                Confirm Delivery for "{confirmingRequest.title || confirmingRequest.category}"
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Did you receive the assistance as promised? Please select the actual outcome.
              </p>
            </div>

            {confirmError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
                {confirmError}
              </div>
            )}

            {/* Outcome choices */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Delivery Outcome</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    id: 'fully-delivered' as const,
                    title: 'Fully Delivered',
                    desc: 'I received all requested items or services in good condition.',
                  },
                  {
                    id: 'partially-delivered' as const,
                    title: 'Partially Delivered',
                    desc: 'Some items/assistance were received, but additional support is still needed.',
                  },
                  {
                    id: 'not-delivered' as const,
                    title: 'Not Delivered / Issue Occurred',
                    desc: 'I did not receive the assistance or there was a problem with the visit.',
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setConfirmOutcome(option.id)}
                    className={`p-3 text-left rounded-xl border transition ${
                      confirmOutcome === option.id
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-900 block">{option.title}</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">{option.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Star Rating for fully delivered */}
            {confirmOutcome === 'fully-delivered' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Rate Volunteer Service
                </label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setConfirmRating(star)}
                      className="p-1 hover:scale-110 transition"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= confirmRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-bold text-slate-700">
                    {confirmRating === 5 ? 'Excellent' : confirmRating === 4 ? 'Good' : confirmRating === 3 ? 'Average' : 'Needs improvement'}
                  </span>
                </div>
              </div>
            )}

            {/* Explanation for partial or not delivered */}
            {confirmOutcome !== 'fully-delivered' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Explanation <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={confirmExplanation}
                  onChange={(e) => setConfirmExplanation(e.target.value)}
                  placeholder="Please describe what was missing or what occurred..."
                  rows={3}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>
            )}

            {/* Optional feedback */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Feedback or Note (Optional)
              </label>
              <input
                type="text"
                value={confirmFeedback}
                onChange={(e) => setConfirmFeedback(e.target.value)}
                placeholder="Any message of thanks or notes for the coordinator..."
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmingRequest(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={submittingConfirm}
                className="px-5 py-2.5 bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 transition shadow disabled:opacity-50"
              >
                {submittingConfirm ? 'Submitting…' : 'Submit Confirmation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT ISSUE MODAL */}
      {reportingIssueRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" /> Issue & Safety Reporting
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Report a Concern for "{reportingIssueRequest.title || reportingIssueRequest.category}"
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Your report will be investigated immediately by the partner NGO and platform administrators.
              </p>
            </div>

            {issueError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
                {issueError}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Issue Category</label>
              <select
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              >
                <option value="delivery_not_received">Delivery Not Received</option>
                <option value="partial_delivery">Partial / Incomplete Delivery</option>
                <option value="incorrect_items">Incorrect Items or Quantities</option>
                <option value="poor_quality">Poor Quality of Items</option>
                <option value="communication_issue">Communication / Behavior Issue</option>
                <option value="safety_concern">Safety or Privacy Concern</option>
                <option value="other">Other Problem</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Describe the Issue in Detail <span className="text-red-500">*</span>
              </label>
              <textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                placeholder="Please describe what happened, dates, and any relevant details so we can investigate and resolve it."
                rows={4}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                required
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
              <strong>What happens next:</strong>
              <p className="mt-0.5 text-[11px]">
                The request status will update to "Issue Reported by Beneficiary". The NGO coordinator and Admin
                will review the case, record investigation notes, and arrange follow-up assistance.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReportingIssueRequest(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleIssueSubmit}
                disabled={submittingIssue}
                className="px-5 py-2.5 bg-red-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-red-800 transition shadow disabled:opacity-50"
              >
                {submittingIssue ? 'Submitting…' : 'Submit Issue Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT REQUEST MODAL */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Submitted Request</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                You can edit your request details while it is in "Submitted" status.
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const form = e.target as HTMLFormElement
                const title = (form.elements.namedItem('title') as HTMLInputElement).value
                const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value
                const city = (form.elements.namedItem('city') as HTMLInputElement).value
                const locality = (form.elements.namedItem('locality') as HTMLInputElement).value
                await onUpdateRequest(editingRequest.id, {
                  title,
                  description,
                  city,
                  locality,
                })
                setEditingRequest(null)
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Title</label>
                <input
                  name="title"
                  defaultValue={editingRequest.title}
                  className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
                <textarea
                  name="description"
                  defaultValue={editingRequest.description}
                  rows={3}
                  className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">City</label>
                  <input
                    name="city"
                    defaultValue={editingRequest.city}
                    className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Locality</label>
                  <input
                    name="locality"
                    defaultValue={editingRequest.locality || ''}
                    className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRequest(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
