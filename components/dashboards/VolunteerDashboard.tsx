'use client'

import { useState } from 'react'
import {
  Users,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  FileCheck,
  PhoneCall,
  UserX,
  MapPin,
  Building2,
  Calendar,
  Send,
  Star,
  ShieldCheck,
  ChevronRight,
  Filter,
} from 'lucide-react'
import type { HelpRequest, NotificationItem, SafeUser, VolunteerOpportunity } from '../../lib/types'
import {
  getStatusBadgeInfo,
  getUrgencyBadgeInfo,
  formatDateTime,
  getRelativeTime,
  maskContactDetail,
} from '../../lib/dashboard-helpers'
import { categories } from '../../lib/categories'

export default function VolunteerDashboard({
  user,
  requests,
  opportunities,
  notifications,
  onRefresh,
  onApplyOpportunity,
  onUpdateTaskStatus,
  onSubmitCompletionReport,
  onUpdateProfile,
  onNavigateTab,
}: {
  user: SafeUser
  requests: HelpRequest[]
  opportunities: VolunteerOpportunity[]
  notifications: NotificationItem[]
  onRefresh: () => void
  onApplyOpportunity: (opportunityId: string) => Promise<void>
  onUpdateTaskStatus: (requestId: string, status: string, note?: string) => Promise<void>
  onSubmitCompletionReport: (
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
  ) => Promise<void>
  onUpdateProfile: (updates: Partial<SafeUser>) => Promise<void>
  onNavigateTab: (tab: string) => void
}) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'assigned-tasks' | 'opportunities' | 'my-applications' | 'profile'>('overview')
  const [selectedTask, setSelectedTask] = useState<HelpRequest | null>(null)
  const [completingTask, setCompletingTask] = useState<HelpRequest | null>(null)
  const [reportingObstacleTask, setReportingObstacleTask] = useState<HelpRequest | null>(null)
  const [applyingOpId, setApplyingOpId] = useState<string | null>(null)
  const [opCategoryFilter, setOpCategoryFilter] = useState('')

  // Completion Form State
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10))
  const [visitTime, setVisitTime] = useState('')
  const [itemsDelivered, setItemsDelivered] = useState('')
  const [quantityDelivered, setQuantityDelivered] = useState('')
  const [volunteerNotes, setVolunteerNotes] = useState('')
  const [deliveryOutcome, setDeliveryOutcome] = useState<'fully-delivered' | 'partially-delivered' | 'not-delivered'>('fully-delivered')
  const [followUpNeeded, setFollowUpNeeded] = useState(false)
  const [volunteerAvailableAgain, setVolunteerAvailableAgain] = useState(true)
  const [obstacleText, setObstacleText] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState('')

  // Obstacle Reporting State
  const [obstacleReason, setObstacleReason] = useState<'task_blocked' | 'unable_to_contact' | 'needs_follow_up'>('task_blocked')
  const [obstacleNote, setObstacleNote] = useState('')
  const [submittingObstacle, setSubmittingObstacle] = useState(false)

  // Profile Edit State
  const [profileName, setProfileName] = useState(user.name || '')
  const [profilePhone, setProfilePhone] = useState(user.phone || '')
  const [profileCity, setProfileCity] = useState(user.city || '')
  const [profileLocality, setProfileLocality] = useState(user.locality || '')
  const [profileSkills, setProfileSkills] = useState(user.skills || '')
  const [profileInterests, setProfileInterests] = useState(user.interests || '')
  const [profileAvailableDays, setProfileAvailableDays] = useState(user.availableDays || '')
  const [profileAreas, setProfileAreas] = useState(user.areasOfSupport?.join(', ') || '')
  const [profileMotivation, setProfileMotivation] = useState(user.motivation || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSavedMsg, setProfileSavedMsg] = useState('')

  const isVerified = user.status === 'verified'

  // Task filtering
  const activeTasks = requests.filter((r) => ['in_progress', 'task_blocked', 'unable_to_contact', 'needs_follow_up'].includes(r.status))
  const pendingConfirmationTasks = requests.filter((r) => r.status === 'awaiting_beneficiary_verification')
  const completedTasks = requests.filter((r) => ['verified_completed', 'partially_completed', 'resolved'].includes(r.status))

  // Opportunities filtering
  const filteredOps = opportunities.filter((op) => {
    if (!opCategoryFilter) return true
    return op.category === opCategoryFilter
  })
  const appliedOpportunities = opportunities.filter((op) => op.hasApplied)

  const handleApply = async (opId: string) => {
    setApplyingOpId(opId)
    try {
      await onApplyOpportunity(opId)
    } finally {
      setApplyingOpId(null)
    }
  }

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!completingTask) return
    if (!visitDate) {
      setReportError('Please select the visit date.')
      return
    }
    if (!volunteerNotes.trim()) {
      setReportError('Please describe the work performed during the visit.')
      return
    }

    setSubmittingReport(true)
    setReportError('')
    try {
      const summaryText = [
        deliveryOutcome === 'fully-delivered' ? 'Completed fully.' : deliveryOutcome === 'partially-delivered' ? 'Completed partially.' : 'Not delivered.',
        itemsDelivered ? `Delivered: ${itemsDelivered}${quantityDelivered ? ` (${quantityDelivered})` : ''}` : '',
        `Visit: ${visitDate}${visitTime ? ` at ${visitTime}` : ''}`,
        volunteerNotes.trim(),
        followUpNeeded ? 'Follow-up is recommended.' : '',
      ].filter(Boolean).join(' | ')

      await onSubmitCompletionReport(completingTask, {
        completionReport: summaryText,
        visitDate,
        visitTime,
        itemsDelivered: itemsDelivered.trim(),
        quantityDelivered: quantityDelivered.trim(),
        volunteerNotes: volunteerNotes.trim(),
        volunteerAvailableAgain,
        followUpNeeded,
        deliveryOutcome,
        obstacleDetails: obstacleText.trim() || undefined,
      })

      setCompletingTask(null)
      setVolunteerNotes('')
      setItemsDelivered('')
      setQuantityDelivered('')
    } catch (err: any) {
      setReportError(err.message || 'Failed to submit completion report.')
    } finally {
      setSubmittingReport(false)
    }
  }

  const handleObstacleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportingObstacleTask || !obstacleNote.trim()) return
    setSubmittingObstacle(true)
    try {
      await onUpdateTaskStatus(reportingObstacleTask.id, obstacleReason, obstacleNote.trim())
      setReportingObstacleTask(null)
      setObstacleNote('')
    } finally {
      setSubmittingObstacle(false)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSavedMsg('')
    try {
      await onUpdateProfile({
        name: profileName.trim(),
        phone: profilePhone.trim(),
        city: profileCity.trim(),
        locality: profileLocality.trim(),
        skills: profileSkills.trim(),
        interests: profileInterests.trim(),
        availableDays: profileAvailableDays.trim(),
        areasOfSupport: profileAreas.split(',').map((s) => s.trim()).filter(Boolean),
        motivation: profileMotivation.trim(),
      })
      setProfileSavedMsg('Profile and availability updated successfully!')
      setTimeout(() => setProfileSavedMsg(''), 3000)
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Verification Status Warning if pending */}
      {!isVerified && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs sm:text-sm flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Volunteer Account Verification Pending Review</strong>
            <p className="mt-0.5 text-xs text-amber-800">
              Your profile is currently under review by our verification team. Once an Administrator approves
              your profile, you will receive full access to accept field opportunities and assigned community tasks.
            </p>
          </div>
        </div>
      )}

      {/* Volunteer Workspace Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 text-white p-6 sm:p-8 rounded-2xl shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-800 text-emerald-200 border border-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" /> {isVerified ? 'Verified Field Volunteer' : 'Pending Verification'}
              </span>
              <span className="text-xs text-emerald-300">
                {user.city} {user.locality ? `· ${user.locality}` : ''}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {user.name}'s Volunteer Workspace
            </h1>
            <p className="text-emerald-100/90 text-xs sm:text-sm mt-1 leading-relaxed">
              Coordinate field support, log completed visits, and connect directly with partner NGOs to help neighbors in need.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('opportunities')}
              className="px-4 py-2.5 bg-amber-400 text-emerald-950 font-bold text-xs sm:text-sm rounded-xl hover:bg-amber-300 transition shadow"
            >
              Browse Opportunities
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('assigned-tasks')}
              className="px-4 py-2.5 bg-emerald-800/80 text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 border border-emerald-600/50 transition"
            >
              Assigned Tasks ({activeTasks.length})
            </button>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
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
          Overview & Metrics
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('assigned-tasks')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'assigned-tasks'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Assigned Tasks
          {activeTasks.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {activeTasks.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('opportunities')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'opportunities'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          NGO Opportunities ({opportunities.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('my-applications')}
          className={`pb-3 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeSubTab === 'my-applications'
              ? 'border-emerald-700 text-emerald-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          My Applications ({appliedOpportunities.length})
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
          Profile & Availability
        </button>
      </div>

      {/* OVERVIEW SUBTAB */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Assigned Tasks</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{requests.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-sky-700 font-medium">Active Tasks</span>
              <p className="text-2xl font-bold text-sky-900 mt-1">{activeTasks.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-amber-700 font-medium">Awaiting Beneficiary</span>
              <p className="text-2xl font-bold text-amber-900 mt-1">{pendingConfirmationTasks.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-emerald-700 font-medium">Completed Deliveries</span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{completedTasks.length}</p>
            </div>
          </div>

          {/* Quick Active Task list */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Immediate Tasks Requiring Field Work</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tasks assigned to you by partner NGOs</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('assigned-tasks')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
              >
                View all tasks <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeTasks.length === 0 ? (
              <div className="p-8 text-center">
                <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800">No active assigned tasks right now</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Browse open NGO volunteer opportunities in your city to participate in upcoming relief drives.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('opportunities')}
                  className="mt-4 px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition"
                >
                  Explore Opportunities
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeTasks.map((task) => {
                  const badge = getStatusBadgeInfo(task.status)
                  const urgencyBadge = getUrgencyBadgeInfo(task.urgency)

                  return (
                    <div key={task.id} className="p-4 sm:p-5 hover:bg-slate-50/60 transition space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-semibold"
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
                          </div>
                          <h4 className="text-base font-bold text-slate-900 mt-1">
                            {task.title || `${task.category} in ${task.city}`}
                          </h4>
                          <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{task.description}</p>
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setCompletingTask(task)
                              setDeliveryOutcome('fully-delivered')
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition shadow-xs"
                          >
                            <FileCheck className="w-3.5 h-3.5" /> Submit Report
                          </button>
                          <button
                            type="button"
                            onClick={() => setReportingObstacleTask(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" /> Obstacle
                          </button>
                        </div>
                      </div>

                      {/* Beneficiary info */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>
                          Beneficiary: <strong className="text-slate-800">{task.seekerName}</strong>
                        </span>
                        <span>
                          Contact: <strong className="text-slate-800">{task.seekerPhone || 'Not provided'}</strong>
                        </span>
                        <span>
                          Location: <strong className="text-slate-800">{task.city} {task.locality ? `(${task.locality})` : ''}</strong>
                        </span>
                        <span>
                          Assigned NGO: <strong className="text-slate-800">{task.assignedNgoName || 'Partner'}</strong>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASSIGNED TASKS SUBTAB */}
      {activeSubTab === 'assigned-tasks' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assigned Tasks Workflow</h2>
            <p className="text-xs text-slate-500">
              Manage assigned support requests, start work, log visits, and submit structured completion reports.
            </p>
          </div>

          {requests.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No tasks assigned yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                When verified NGOs assign relief activities to you, they will appear here with full instructions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((task) => {
                const badge = getStatusBadgeInfo(task.status)
                const urgencyBadge = getUrgencyBadgeInfo(task.urgency)
                const isInProgress = task.status === 'in_progress'
                const isBlocked = ['task_blocked', 'unable_to_contact', 'needs_follow_up'].includes(task.status)
                const isAwaitingVerification = task.status === 'awaiting_beneficiary_verification'

                return (
                  <div
                    key={task.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3"
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
                            Assigned on {formatDateTime(task.createdAt)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-1.5">
                          {task.title || `${task.category} in ${task.city}`}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1">{task.description}</p>
                      </div>

                      {/* Workflow Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {isBlocked && (
                          <button
                            type="button"
                            onClick={() => onUpdateTaskStatus(task.id, 'in_progress', 'Volunteer resumed task.')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition"
                          >
                            <Play className="w-3.5 h-3.5" /> Resume Task
                          </button>
                        )}

                        {isInProgress && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCompletingTask(task)
                                setDeliveryOutcome('fully-delivered')
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition shadow-xs"
                            >
                              <FileCheck className="w-3.5 h-3.5" /> Submit Completion Report
                            </button>
                            <button
                              type="button"
                              onClick={() => setReportingObstacleTask(task)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Report Obstacle
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Beneficiary Details (Authorized view) */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Beneficiary Name</span>
                        <strong className="text-slate-800 font-semibold">{task.seekerName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Contact Phone</span>
                        <strong className="text-slate-800 font-semibold">{task.seekerPhone || 'Not provided'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Delivery Location</span>
                        <strong className="text-slate-800 font-semibold">
                          {task.city} {task.locality ? `(${task.locality})` : ''}
                        </strong>
                      </div>
                    </div>

                    {/* Coordinator Notes */}
                    {task.notes && task.notes.length > 0 && (
                      <div className="text-xs text-slate-500">
                        <strong className="text-slate-700">Coordinator Notes:</strong>{' '}
                        {task.notes[task.notes.length - 1]}
                      </div>
                    )}

                    {/* Completion report status */}
                    {task.completionReport && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                        <span className="font-bold text-emerald-950 block">Submitted Completion Report:</span>
                        <p className="text-emerald-900">{task.completionReport}</p>
                        {isAwaitingVerification && (
                          <span className="text-[11px] text-amber-700 font-semibold block mt-1">
                            ⏳ Waiting for the beneficiary to confirm receipt and rate the delivery.
                          </span>
                        )}
                      </div>
                    )}

                    {/* Beneficiary Rating display */}
                    {task.rating && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        Beneficiary Rating: {task.rating} / 5 Stars
                        {task.beneficiaryConfirmedAt && (
                          <span className="text-slate-400 font-normal">
                            (Confirmed on {formatDateTime(task.beneficiaryConfirmedAt)})
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

      {/* OPPORTUNITIES SUBTAB */}
      {activeSubTab === 'opportunities' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Volunteer Opportunities</h2>
              <p className="text-xs text-slate-500">Published by verified NGOs in need of volunteer support</p>
            </div>
          </div>

          {filteredOps.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No opportunities available</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Check back soon or update your city and support categories in your profile to discover local initiatives.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredOps.map((op) => (
                <div
                  key={op.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {op.category}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {op.mode} · {op.city}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{op.title}</h3>
                    <p className="text-xs text-slate-600 line-clamp-3">{op.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {op.applicantCount} applicant{op.applicantCount === 1 ? '' : 's'}
                    </span>
                    {op.hasApplied ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApply(op.id)}
                        disabled={applyingOpId === op.id || !isVerified}
                        className="px-4 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition disabled:opacity-50"
                      >
                        {applyingOpId === op.id ? 'Applying…' : 'Apply Now'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MY APPLICATIONS SUBTAB */}
      {activeSubTab === 'my-applications' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Opportunity Applications</h2>
            <p className="text-xs text-slate-500">Track status of your applications to NGO programs</p>
          </div>

          {appliedOpportunities.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">No applications submitted</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Explore the open opportunities tab and apply to programs matching your skills and schedule.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('opportunities')}
                className="mt-4 px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition"
              >
                Browse Opportunities
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {appliedOpportunities.map((op) => (
                <div
                  key={op.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      {op.category}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{op.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {op.mode} · {op.city} · Applied on {formatDateTime(op.createdAt)}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Application Active
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROFILE & AVAILABILITY SUBTAB */}
      {activeSubTab === 'profile' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs max-w-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Volunteer Profile & Availability</h2>
            <p className="text-xs text-slate-500 mt-1">
              Keep your profile up to date so partner NGOs can match you with appropriate tasks.
            </p>
          </div>

          {profileSavedMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              {profileSavedMsg}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={profileCity}
                  onChange={(e) => setProfileCity(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Locality</label>
                <input
                  type="text"
                  value={profileLocality}
                  onChange={(e) => setProfileLocality(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Skills</label>
              <input
                type="text"
                value={profileSkills}
                onChange={(e) => setProfileSkills(e.target.value)}
                placeholder="e.g. First Aid, Driving, Distribution, Teaching, Translation"
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Available Days / Time</label>
              <input
                type="text"
                value={profileAvailableDays}
                onChange={(e) => setProfileAvailableDays(e.target.value)}
                placeholder="e.g. Weekends, Monday-Wednesday afternoons"
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Areas of Support</label>
              <input
                type="text"
                value={profileAreas}
                onChange={(e) => setProfileAreas(e.target.value)}
                placeholder={categories.slice(0, 3).map((category) => category.label).join(', ')}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400">Separate multiple categories with commas</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Motivation & Experience</label>
              <textarea
                value={profileMotivation}
                onChange={(e) => setProfileMotivation(e.target.value)}
                placeholder="Tell us what drives you to volunteer and any past social impact work..."
                rows={3}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 transition shadow disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save Profile Updates'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STRUCTURED COMPLETION REPORT MODAL */}
      {completingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Field Visit Report
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                Completion Report: {completingTask.title || completingTask.category}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record the work performed during your visit. Once submitted, the beneficiary will receive a prompt to verify delivery.
              </p>
            </div>

            {reportError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
                {reportError}
              </div>
            )}

            <form onSubmit={handleReportSubmit} className="space-y-3">
              {/* Outcome */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Task Completion Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'fully-delivered' as const, label: 'Fully Completed' },
                    { id: 'partially-delivered' as const, label: 'Partially Completed' },
                    { id: 'not-delivered' as const, label: 'Not Completed' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDeliveryOutcome(opt.id)}
                      className={`py-2 px-1 text-xs text-center font-bold rounded-xl border transition ${
                        deliveryOutcome === opt.id
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Visit Date</label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Visit Time (Optional)</label>
                  <input
                    type="time"
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Items & Quantity */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Items / Service Delivered</label>
                  <input
                    type="text"
                    value={itemsDelivered}
                    onChange={(e) => setItemsDelivered(e.target.value)}
                    placeholder="e.g. Rice, pulses, oil, medicine"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Quantity / Count</label>
                  <input
                    type="text"
                    value={quantityDelivered}
                    onChange={(e) => setQuantityDelivered(e.target.value)}
                    placeholder="e.g. 1 kit, 5 kg, 2 boxes"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Work Performed & Observations <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={volunteerNotes}
                  onChange={(e) => setVolunteerNotes(e.target.value)}
                  placeholder="Describe your interaction with the beneficiary, work performed, condition, or any relevant details..."
                  rows={3}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                  required
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followUpNeeded}
                    onChange={(e) => setFollowUpNeeded(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>Follow-up visit or further assistance is recommended</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={volunteerAvailableAgain}
                    onChange={(e) => setVolunteerAvailableAgain(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>I am available for another task in this area</span>
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="px-5 py-2.5 bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-800 transition shadow disabled:opacity-50"
                >
                  {submittingReport ? 'Submitting…' : 'Submit Completion Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT OBSTACLE MODAL */}
      {reportingObstacleTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" /> Report an Obstacle or Problem
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Issue on: {reportingObstacleTask.title || reportingObstacleTask.category}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Notify the NGO coordinator about obstacles, inability to reach the beneficiary, or needed follow-up.
              </p>
            </div>

            <form onSubmit={handleObstacleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Obstacle Type</label>
                <select
                  value={obstacleReason}
                  onChange={(e) => setObstacleReason(e.target.value as any)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200"
                >
                  <option value="task_blocked">Task Blocked (Cannot proceed right now)</option>
                  <option value="unable_to_contact">Unable to Contact Beneficiary (Phone unanswered/address unavailable)</option>
                  <option value="needs_follow_up">Needs Coordinator Follow-up (More supplies or NGO intervention needed)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Explanation & Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={obstacleNote}
                  onChange={(e) => setObstacleNote(e.target.value)}
                  placeholder="Explain what happened so the NGO coordinator can assist or reassign..."
                  rows={4}
                  className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReportingObstacleTask(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingObstacle}
                  className="px-4 py-2 bg-amber-700 text-white font-bold text-xs rounded-xl hover:bg-amber-800 transition"
                >
                  {submittingObstacle ? 'Saving…' : 'Submit Obstacle Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
