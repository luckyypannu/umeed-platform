import mongoose, { Types, type ClientSession } from 'mongoose'
import { Router } from 'express'
import { z } from 'zod'
import type { ServerConfig } from '../config/env.js'
import { AuditEvent } from '../models/audit-event.js'
import { Notification } from '../models/private-features.js'
import {
  requestStatuses,
  requestUrgencies,
  SupportRequest,
  type RequestStatus,
  type SupportRequestDocument,
} from '../models/support-request.js'
import { User, type UserDocument } from '../models/user.js'
import type { AuthenticatedUser } from '../auth/types.js'
import {
  requireCsrf,
  requireFrontendOrigin,
  requireRoles,
  requireSession,
} from '../auth/middleware.js'

const requestBodySchema = z.object({
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  city: z.string().trim().min(1).max(120),
  locality: z.string().trim().max(120).optional(),
  urgency: z.enum(requestUrgencies).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(32).optional(),
}).strict()

const updateBodySchema = z.object({
  status: z.enum(requestStatuses).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  urgency: z.enum(requestUrgencies).optional(),
  assignedNgoId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  assignedNgoName: z.string().max(160).optional(),
  assignedVolunteerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  completionReport: z.string().trim().min(1).max(2000).optional(),
  visitDate: z.string().trim().max(50).optional(),
  visitTime: z.string().trim().max(50).optional(),
  itemsDelivered: z.string().trim().max(500).optional(),
  quantityDelivered: z.string().trim().max(100).optional(),
  volunteerNotes: z.string().trim().max(2000).optional(),
  volunteerAvailableAgain: z.boolean().optional(),
  followUpNeeded: z.boolean().optional(),
  deliveryOutcome: z.string().trim().max(50).optional(),
  issueType: z.string().trim().min(1).max(120).optional(),
  issueDetails: z.string().trim().min(1).max(2000).optional(),
  resolutionNotes: z.string().trim().min(1).max(2000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
}).strict().refine(
  (update) => Object.values(update).some((value) => value !== undefined),
  'At least one request field is required',
)

const listQuerySchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  status: z.enum(requestStatuses).optional(),
})

const allowedTransitions: Record<RequestStatus, readonly RequestStatus[]> = {
  submitted: ['under_review', 'in_progress', 'cancelled'],
  under_review: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_beneficiary_verification', 'needs_follow_up', 'task_blocked', 'unable_to_contact', 'resolved'],
  awaiting_beneficiary_verification: ['verified_completed', 'partially_completed', 'beneficiary_reported_issue', 'needs_follow_up'],
  verified_completed: ['resolved'],
  partially_completed: ['needs_follow_up', 'resolved'],
  beneficiary_reported_issue: ['needs_follow_up', 'task_blocked', 'in_progress', 'resolved'],
  needs_follow_up: ['in_progress', 'task_blocked', 'unable_to_contact'],
  unable_to_contact: ['in_progress', 'needs_follow_up'],
  task_blocked: ['in_progress', 'needs_follow_up'],
  resolved: [],
  cancelled: [],
}

function isObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id.toLowerCase()
}

function singleRouteParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function requestScope(user: AuthenticatedUser): Record<string, unknown> | null {
  if (user.role === 'seeker') return { seekerId: new Types.ObjectId(user.id) }
  if (user.role === 'volunteer') {
    return { assignedVolunteerId: new Types.ObjectId(user.id) }
  }
  return null
}

async function ngoScope(user: AuthenticatedUser): Promise<Record<string, unknown> | null> {
  const ngo = await User.findOne({
    _id: user.id,
    role: 'ngo',
    status: 'verified',
  }).select('city operatingCity areasOfSupport').lean()
  if (!ngo) return null

  const city = ngo.operatingCity || ngo.city
  const eligible: Record<string, unknown> = {
    assignedNgoId: null,
    city: { $regex: `^${escapedRegex(city)}$`, $options: 'i' },
    status: { $in: ['submitted', 'under_review'] },
  }
  if (ngo.areasOfSupport.length > 0) {
    eligible.category = { $in: ngo.areasOfSupport }
  }

  return {
    $or: [
      { assignedNgoId: new Types.ObjectId(user.id) },
      eligible,
    ],
  }
}

function listFilter(query: z.infer<typeof listQuerySchema>): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  if (query.category) filter.category = query.category
  if (query.city) filter.city = { $regex: `^${escapedRegex(query.city)}$`, $options: 'i' }
  if (query.status) filter.status = query.status
  return filter
}

async function scopedQuery(
  user: AuthenticatedUser,
  filter: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  if (user.role === 'admin') return filter
  const scope =
    user.role === 'ngo'
      ? await ngoScope(user)
      : requestScope(user)
  if (!scope) return null
  return Object.keys(filter).length > 0 ? { $and: [scope, filter] } : scope
}

async function logAdminAccess(
  user: AuthenticatedUser,
  action: string,
  targetId: string,
): Promise<void> {
  await AuditEvent.create({
    actorId: new Types.ObjectId(user.id),
    actorRole: 'admin',
    action,
    targetType: 'request',
    targetId,
    outcome: 'succeeded',
  })
}

function canTransition(current: RequestStatus, target: RequestStatus): boolean {
  return allowedTransitions[current].includes(target)
}

async function createAuditEvent(
  user: AuthenticatedUser,
  values: {
    action: string
    targetType: 'request' | 'user'
    targetId: string
    outcome?: 'succeeded' | 'denied' | 'conflict'
    fromStatus?: string
    toStatus?: string
    details?: Record<string, string>
  },
  session?: ClientSession,
): Promise<void> {
  const [event] = await AuditEvent.create(
    [{
      actorId: new Types.ObjectId(user.id),
      actorRole: user.role,
      action: values.action,
      targetType: values.targetType,
      targetId: values.targetId,
      outcome: values.outcome ?? 'succeeded',
      fromStatus: values.fromStatus ?? '',
      toStatus: values.toStatus ?? '',
      details: values.details ?? {},
    }],
    session ? { session } : undefined,
  )
  if (!event) throw new Error('Audit event was not persisted')
}

function assignmentIsPresent(request: SupportRequestDocument): boolean {
  return request.assignedNgoId !== null
}

async function serializeRequests(
  requests: SupportRequestDocument[],
  user: AuthenticatedUser,
): Promise<Record<string, unknown>[]> {
  const userIds = new Set<string>()
  for (const supportRequest of requests) {
    if (supportRequest.assignedNgoId) userIds.add(supportRequest.assignedNgoId.toString())
    if (supportRequest.assignedVolunteerId) userIds.add(supportRequest.assignedVolunteerId.toString())
  }

  const users = userIds.size > 0
    ? await User.find({ _id: { $in: [...userIds] } }).select('name orgName role').lean()
    : []
  const assignedUsers = new Map(users.map((assignedUser) => [assignedUser._id.toString(), assignedUser]))

  return requests.map((supportRequest) => {
    const assigned = assignmentIsPresent(supportRequest)
    const result: Record<string, unknown> = {
      id: supportRequest._id.toString(),
      title: supportRequest.title,
      category: supportRequest.category,
      description: supportRequest.description,
      city: supportRequest.city,
      urgency: supportRequest.urgency,
      status: supportRequest.status,
      assignedNgoId: supportRequest.assignedNgoId?.toString(),
      assignedVolunteerId: supportRequest.assignedVolunteerId?.toString(),
      assignedNgoName: supportRequest.assignedNgoId
        ? assignedUsers.get(supportRequest.assignedNgoId.toString())?.orgName ||
          assignedUsers.get(supportRequest.assignedNgoId.toString())?.name
        : undefined,
      assignedVolunteerName: supportRequest.assignedVolunteerId
        ? assignedUsers.get(supportRequest.assignedVolunteerId.toString())?.name
        : undefined,
      completionReport: supportRequest.completionReport || undefined,
      visitDate: supportRequest.visitDate || undefined,
      visitTime: supportRequest.visitTime || undefined,
      itemsDelivered: supportRequest.itemsDelivered || undefined,
      quantityDelivered: supportRequest.quantityDelivered || undefined,
      volunteerNotes: supportRequest.volunteerNotes || undefined,
      volunteerAvailableAgain: supportRequest.volunteerAvailableAgain,
      followUpNeeded: supportRequest.followUpNeeded,
      deliveryOutcome: supportRequest.deliveryOutcome || undefined,
      issueType: supportRequest.issueType || undefined,
      issueDetails: supportRequest.issueDetails || undefined,
      resolutionNotes: supportRequest.resolutionNotes || undefined,
      resolvedAt: supportRequest.resolvedAt?.toISOString() ?? undefined,
      rating: supportRequest.rating ?? undefined,
      beneficiaryConfirmedAt: supportRequest.beneficiaryConfirmedAt?.toISOString() ?? undefined,
      createdAt: supportRequest.createdAt.toISOString(),
      updatedAt: supportRequest.updatedAt.toISOString(),
    }

    const isOwner =
      user.role === 'seeker' && supportRequest.seekerId.toString() === user.id
    const isAssigned =
      user.role === 'admin' ||
      isOwner ||
      (user.role === 'ngo' && supportRequest.assignedNgoId?.toString() === user.id) ||
      (user.role === 'volunteer' && supportRequest.assignedVolunteerId?.toString() === user.id)

    if (isAssigned) {
      result.locality = supportRequest.locality
      result.seekerName = supportRequest.seekerName
      result.seekerPhone = supportRequest.seekerPhone
      result.notes = supportRequest.notes
    }
    return result
  })
}

export function createRequestRouter(config: ServerConfig) {
  const router = Router()
  const authenticate = requireSession(config)
  const csrf = requireCsrf(config)
  const requireOrigin = requireFrontendOrigin(config)

  router.get('/', authenticate, async (request, response) => {
    const parsedQuery = listQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) {
      response.status(400).json({ error: 'Invalid request filters', requestId: request.id })
      return
    }
    const user = request.auth!.user
    if (!['seeker', 'ngo', 'volunteer', 'admin'].includes(user.role)) {
      response.status(403).json({ error: 'Forbidden', requestId: request.id })
      return
    }
    if (user.role === 'ngo' && !(await ngoScope(user))) {
      response.status(403).json({ error: 'Verified NGO access is required', requestId: request.id })
      return
    }

    if (user.role === 'admin') {
      await logAdminAccess(user, 'request.list.accessed', 'collection')
    }

    const scope = await scopedQuery(user, listFilter(parsedQuery.data))
    if (!scope) {
      response.status(403).json({ error: 'Forbidden', requestId: request.id })
      return
    }
    const requests = await SupportRequest.find(scope)
      .sort({ createdAt: -1 })
      .limit(100)
    const serialized = await serializeRequests(requests, user)
    response.setHeader('Cache-Control', 'no-store')
    response.json({ success: true, requests: serialized })
  })

  router.post(
    '/',
    requireOrigin,
    authenticate,
    requireRoles('seeker'),
    csrf,
    async (request, response) => {
      const parsed = requestBodySchema.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid support request', requestId: request.id })
        return
      }

      const seeker = await User.findOne({
        _id: request.auth!.user.id,
        role: 'seeker',
        status: 'active',
      }).select('name phone')
      if (!seeker) {
        response.status(403).json({ error: 'Active seeker access is required', requestId: request.id })
        return
      }

      const { category, description, city, locality, urgency, title } = parsed.data
      const dbSession = await mongoose.startSession()
      let supportRequest: SupportRequestDocument | null = null
      try {
        await dbSession.withTransaction(async () => {
          const [created] = await SupportRequest.create([{
            title: title || `${category} Assistance in ${city}${locality ? ` (${locality})` : ''}`,
            category,
            description,
            city,
            locality: locality ?? '',
            urgency: urgency ?? 'medium',
            seekerId: seeker._id,
            seekerName: seeker.name,
            seekerPhone: seeker.phone,
          }], { session: dbSession })
          supportRequest = created
          await Notification.create([{
            recipientId: seeker._id,
            message: 'Your support request has been submitted successfully.',
            type: 'info',
            link: '/dashboard?tab=my-requests',
          }], { session: dbSession })
        })
      } finally {
        await dbSession.endSession()
      }
      if (!supportRequest) throw new Error('Support request was not persisted')
      const [serialized] = await serializeRequests([supportRequest], request.auth!.user)
      response.setHeader('Cache-Control', 'no-store')
      response.status(201).json({ success: true, request: serialized })
    },
  )

  router.get('/:id', authenticate, async (request, response) => {
    const id = singleRouteParam(request.params.id)
    if (!id || !isObjectId(id)) {
      response.status(404).json({ error: 'Request not found', requestId: request.id })
      return
    }
    const user = request.auth!.user
    if (!['seeker', 'ngo', 'volunteer', 'admin'].includes(user.role)) {
      response.status(403).json({ error: 'Forbidden', requestId: request.id })
      return
    }
    if (user.role === 'ngo' && !(await ngoScope(user))) {
      response.status(403).json({ error: 'Verified NGO access is required', requestId: request.id })
      return
    }
    if (user.role === 'admin') {
      await logAdminAccess(user, 'request.detail.accessed', id)
    }

    const scope = await scopedQuery(user, { _id: new Types.ObjectId(id) })
    if (!scope) {
      response.status(403).json({ error: 'Forbidden', requestId: request.id })
      return
    }
    const supportRequest = await SupportRequest.findOne(scope)
    if (!supportRequest) {
      response.status(404).json({ error: 'Request not found', requestId: request.id })
      return
    }

    const [serialized] = await serializeRequests([supportRequest], user)
    response.setHeader('Cache-Control', 'no-store')
    response.json({ success: true, request: serialized })
  })

  router.patch(
    '/:id',
    requireOrigin,
    authenticate,
    csrf,
    async (request, response) => {
      const user = request.auth!.user
      if (!['seeker', 'ngo', 'volunteer', 'admin'].includes(user.role)) {
        response.status(403).json({ error: 'Forbidden', requestId: request.id })
        return
      }
      const id = singleRouteParam(request.params.id)
      if (!id || !isObjectId(id)) {
        response.status(404).json({ error: 'Request not found', requestId: request.id })
        return
      }
      const parsed = updateBodySchema.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid request update', requestId: request.id })
        return
      }
      const input = parsed.data
      const baseScope = await scopedQuery(user, { _id: new Types.ObjectId(id) })
      if (!baseScope) {
        response.status(403).json({ error: 'Verified NGO access is required', requestId: request.id })
        return
      }
      const existing = await SupportRequest.findOne(baseScope)
      if (!existing) {
        response.status(404).json({ error: 'Request not found', requestId: request.id })
        return
      }

      const update: Record<string, unknown> = {}
      const currentStatus = existing.status
      let nextStatus = currentStatus
      let action = 'request.updated'
      let assignmentChanged = false

      if (user.role === 'seeker') {
        const seekerFields = ['title', 'category', 'description', 'city', 'locality', 'urgency'] as const
        const beneficiaryStatusCases = ['verified_completed', 'partially_completed', 'beneficiary_reported_issue'] as const

        if (input.status !== undefined && input.status !== 'cancelled' && !beneficiaryStatusCases.includes(input.status as (typeof beneficiaryStatusCases)[number])) {
          response.status(403).json({ error: 'Seekers may only cancel their own requests or confirm delivery outcomes', requestId: request.id })
          return
        }
        if (input.note || input.assignedNgoId || input.assignedVolunteerId) {
          response.status(403).json({ error: 'Seeker cannot change assignments or coordinator notes', requestId: request.id })
          return
        }
        if (input.status === 'cancelled') {
          if (!['submitted', 'under_review'].includes(currentStatus)) {
            response.status(409).json({ error: 'This request can no longer be cancelled', requestId: request.id })
            return
          }
          nextStatus = 'cancelled'
          update.status = nextStatus
          action = 'request.cancelled'
          if (seekerFields.some((field) => input[field] !== undefined)) {
            response.status(400).json({ error: 'Cancellation cannot include other edits', requestId: request.id })
            return
          }
        } else if (input.status !== undefined) {
          if (existing.beneficiaryConfirmedAt && (input.status === 'verified_completed' || input.status === 'partially_completed')) {
            response.status(409).json({ error: 'Delivery outcome has already been confirmed by beneficiary', requestId: request.id })
            return
          }
          if (currentStatus !== 'awaiting_beneficiary_verification' && input.status !== 'beneficiary_reported_issue') {
            response.status(409).json({ error: 'Beneficiary confirmation is only available after the volunteer marks the work as complete', requestId: request.id })
            return
          }
          if (!beneficiaryStatusCases.includes(input.status as (typeof beneficiaryStatusCases)[number])) {
            response.status(400).json({ error: 'Invalid beneficiary confirmation outcome', requestId: request.id })
            return
          }
          if (input.status === 'beneficiary_reported_issue' && !input.issueDetails?.trim() && !input.note?.trim()) {
            response.status(400).json({ error: 'Please provide issue details explaining the delivery problem', requestId: request.id })
            return
          }
          nextStatus = input.status
          update.status = nextStatus
          action = 'request.beneficiary.confirmed'
          if (input.rating !== undefined) {
            if (existing.rating !== null) {
              response.status(409).json({ error: 'Rating has already been submitted', requestId: request.id })
              return
            }
            update.rating = input.rating
          }
          if (input.issueType) update.issueType = input.issueType
          if (input.issueDetails) update.issueDetails = input.issueDetails
          if (input.deliveryOutcome) update.deliveryOutcome = input.deliveryOutcome
          update.beneficiaryConfirmedAt = new Date()
        } else if (input.rating !== undefined) {
          if (!['verified_completed', 'partially_completed', 'resolved'].includes(currentStatus)) {
            response.status(409).json({ error: 'Ratings can only be submitted after eligible delivery confirmation', requestId: request.id })
            return
          }
          if (existing.rating !== null) {
            response.status(409).json({ error: 'Rating has already been submitted', requestId: request.id })
            return
          }
          update.rating = input.rating
          action = 'request.rated'
        } else {
          if (currentStatus !== 'submitted') {
            response.status(409).json({ error: 'Only submitted requests can be edited', requestId: request.id })
            return
          }
          for (const field of seekerFields) {
            if (input[field] !== undefined) update[field] = input[field]
          }
          if (Object.keys(update).length === 0) {
            response.status(400).json({ error: 'No editable fields supplied', requestId: request.id })
            return
          }
        }
      } else if (user.role === 'volunteer') {
        if (existing.assignedVolunteerId?.toString() !== user.id) {
          response.status(404).json({ error: 'Request not found', requestId: request.id })
          return
        }
        if (input.rating !== undefined || input.assignedNgoId || input.assignedVolunteerId) {
          response.status(403).json({ error: 'Volunteers cannot modify assignments or submit beneficiary ratings', requestId: request.id })
          return
        }
        const allowedVolunteerTransitions: Record<string, readonly RequestStatus[]> = {
          in_progress: ['awaiting_beneficiary_verification', 'needs_follow_up', 'task_blocked', 'unable_to_contact'],
          awaiting_beneficiary_verification: [],
          needs_follow_up: ['in_progress', 'task_blocked', 'unable_to_contact'],
          beneficiary_reported_issue: [],
          task_blocked: ['in_progress', 'needs_follow_up'],
          unable_to_contact: ['in_progress', 'needs_follow_up'],
        }
        if (input.status !== undefined) {
          const allowed = allowedVolunteerTransitions[currentStatus] ?? []
          if (!allowed.includes(input.status)) {
            response.status(409).json({ error: `Volunteer status transition from ${currentStatus} to ${input.status} is not permitted`, requestId: request.id })
            return
          }
          nextStatus = input.status
          update.status = nextStatus
          action = 'request.status.changed'
        }
        if (input.completionReport) {
          update.completionReport = input.completionReport
        }
        if (input.visitDate) update.visitDate = input.visitDate
        if (input.visitTime) update.visitTime = input.visitTime
        if (input.itemsDelivered) update.itemsDelivered = input.itemsDelivered
        if (input.quantityDelivered) update.quantityDelivered = input.quantityDelivered
        if (input.volunteerNotes) update.volunteerNotes = input.volunteerNotes
        if (input.volunteerAvailableAgain !== undefined) update.volunteerAvailableAgain = input.volunteerAvailableAgain
        if (input.followUpNeeded !== undefined) update.followUpNeeded = input.followUpNeeded
        if (input.deliveryOutcome) update.deliveryOutcome = input.deliveryOutcome

        if (input.issueDetails) {
          update.issueDetails = input.issueDetails
          update.issueType = input.issueType ?? 'obstacle'
        }
        if (input.note) {
          update.$push = { notes: input.note }
        }
        if (Object.keys(update).length === 0) {
          response.status(400).json({ error: 'No permitted volunteer updates supplied', requestId: request.id })
          return
        }
      } else {
        if (input.title !== undefined || input.category !== undefined || input.description !== undefined ||
            input.city !== undefined || input.locality !== undefined || input.urgency !== undefined) {
          response.status(403).json({ error: 'Only the seeker may edit request details', requestId: request.id })
          return
        }

        if (user.role === 'ngo') {
          if (input.assignedNgoId && input.assignedNgoId !== user.id) {
            response.status(403).json({ error: 'NGOs may only assign requests to themselves', requestId: request.id })
            return
          }
          if (existing.assignedNgoId && existing.assignedNgoId.toString() !== user.id) {
            response.status(404).json({ error: 'Request not found', requestId: request.id })
            return
          }
          if (!existing.assignedNgoId && input.assignedNgoId !== user.id) {
            response.status(409).json({ error: 'NGO must assign an eligible request to itself before updating it', requestId: request.id })
            return
          }
          if (
            !existing.assignedNgoId &&
            (input.assignedNgoId !== user.id || !['submitted', 'under_review'].includes(currentStatus))
          ) {
            response.status(409).json({ error: 'An eligible request must be assigned to this NGO before work begins', requestId: request.id })
            return
          }
          if (!existing.assignedNgoId && input.assignedNgoId === user.id) {
            update.assignedNgoId = new Types.ObjectId(user.id)
            assignmentChanged = true
          }
        }

        if (input.assignedNgoId && user.role === 'admin') {
          if (existing.assignedNgoId) {
            response.status(409).json({ error: 'Request already has an NGO assignment', requestId: request.id })
            return
          }
          const targetNgo = await User.findOne({
            _id: input.assignedNgoId,
            role: 'ngo',
            status: 'verified',
          }).select('_id')
          if (!targetNgo) {
            response.status(400).json({ error: 'Assignment target must be a verified NGO', requestId: request.id })
            return
          }
          update.assignedNgoId = targetNgo._id
          assignmentChanged = true
        }

        if (input.assignedVolunteerId) {
          const canAssignVolunteer =
            user.role === 'admin' ||
            (user.role === 'ngo' && existing.assignedNgoId?.toString() === user.id)
          if (!canAssignVolunteer) {
            response.status(403).json({ error: 'Only the assigned NGO or an Admin may assign a volunteer', requestId: request.id })
            return
          }
          if (existing.assignedVolunteerId) {
            response.status(409).json({ error: 'Request already has a volunteer assignment', requestId: request.id })
            return
          }
          const targetVolunteer = await User.findOne({
            _id: input.assignedVolunteerId,
            role: 'volunteer',
            status: 'verified',
          }).select('_id')
          if (!targetVolunteer) {
            response.status(400).json({ error: 'Assignment target must be a verified volunteer', requestId: request.id })
            return
          }
          update.assignedVolunteerId = targetVolunteer._id
          assignmentChanged = true
        }

        if (input.note) {
          if (
            user.role === 'ngo' &&
            existing.assignedNgoId?.toString() !== user.id &&
            input.assignedNgoId !== user.id
          ) {
            response.status(403).json({ error: 'Only the assigned NGO may add coordinator notes', requestId: request.id })
            return
          }
          update.$push = { notes: input.note }
        }

        if (input.status !== undefined) {
          if (!canTransition(currentStatus, input.status)) {
            response.status(409).json({
              error: `Invalid request status transition from ${currentStatus} to ${input.status}`,
              requestId: request.id,
            })
            return
          }
          if (user.role === 'ngo' && input.status === 'in_progress' && !existing.assignedNgoId && !input.assignedNgoId) {
            response.status(409).json({ error: 'NGO must assign the request to itself before starting support', requestId: request.id })
            return
          }
          if (user.role === 'ngo' && (input.status === 'verified_completed' || input.status === 'partially_completed')) {
            response.status(403).json({ error: 'Only the beneficiary can confirm delivery outcomes', requestId: request.id })
            return
          }
          nextStatus = input.status
          update.status = nextStatus
          action = 'request.status.changed'
        }

        if (input.resolutionNotes) {
          update.resolutionNotes = input.resolutionNotes
        }
        if (nextStatus === 'resolved') {
          update.resolvedAt = new Date()
          update.resolvedBy = new Types.ObjectId(user.id)
        }

        if (Object.keys(update).length === 0) {
          response.status(400).json({ error: 'No permitted updates supplied', requestId: request.id })
          return
        }
      }

      const updateFilter = {
        _id: existing._id,
        status: currentStatus,
        assignedNgoId: existing.assignedNgoId,
        assignedVolunteerId: existing.assignedVolunteerId,
        ...(!assignmentIsPresent(existing) && user.role === 'ngo' ? baseScope : {}),
      }

      const dbSession = await mongoose.startSession()
      let updated: SupportRequestDocument | null = null
      try {
        await dbSession.withTransaction(async () => {
          updated = await SupportRequest.findOneAndUpdate(
            updateFilter,
            update,
            { returnDocument: 'after', runValidators: true, session: dbSession },
          )
          if (!updated) return

          await createAuditEvent(user, {
            action: assignmentChanged ? 'request.assignment.changed' : action,
            targetType: 'request',
            targetId: existing._id.toString(),
            fromStatus: currentStatus,
            toStatus: updated.status,
            details: {
              assignedNgoId: updated.assignedNgoId?.toString() ?? '',
              assignedVolunteerId: updated.assignedVolunteerId?.toString() ?? '',
            },
          }, dbSession)
          if (updated.status !== currentStatus) {
            await Notification.create([{
              recipientId: updated.seekerId,
              message: `Your support request status changed to ${updated.status.replaceAll('_', ' ')}.`,
              type: updated.status === 'resolved' ? 'success' : updated.status === 'beneficiary_reported_issue' ? 'alert' : 'info',
              link: '/dashboard?tab=my-requests',
            }], { session: dbSession })

            if (updated.status === 'awaiting_beneficiary_verification') {
              if (updated.assignedNgoId) {
                await Notification.create([{
                  recipientId: updated.assignedNgoId,
                  message: `Volunteer submitted a completion report for "${updated.title}".`,
                  type: 'info',
                  link: '/dashboard?tab=all-requests',
                }], { session: dbSession })
              }
            } else if (['verified_completed', 'partially_completed'].includes(updated.status)) {
              if (updated.assignedVolunteerId) {
                await Notification.create([{
                  recipientId: updated.assignedVolunteerId,
                  message: `Beneficiary confirmed delivery for "${updated.title}".`,
                  type: 'success',
                  link: '/dashboard?tab=all-requests',
                }], { session: dbSession })
              }
              if (updated.assignedNgoId) {
                await Notification.create([{
                  recipientId: updated.assignedNgoId,
                  message: `Beneficiary confirmed delivery for "${updated.title}".`,
                  type: 'success',
                  link: '/dashboard?tab=all-requests',
                }], { session: dbSession })
              }
            } else if (updated.status === 'beneficiary_reported_issue') {
              if (updated.assignedNgoId) {
                await Notification.create([{
                  recipientId: updated.assignedNgoId,
                  message: `Beneficiary reported an issue for "${updated.title}". Review and follow up required.`,
                  type: 'alert',
                  link: '/dashboard?tab=all-requests',
                }], { session: dbSession })
              }
            }
          }

          if (assignmentChanged) {
            if (input.assignedVolunteerId && updated.assignedVolunteerId) {
              await Notification.create([{
                recipientId: updated.assignedVolunteerId,
                message: `You have been assigned to support request "${updated.title}".`,
                type: 'info',
                link: '/dashboard?tab=all-requests',
              }], { session: dbSession })
              await Notification.create([{
                recipientId: updated.seekerId,
                message: `A volunteer has been assigned to coordinate your assistance.`,
                type: 'info',
                link: '/dashboard?tab=my-requests',
              }], { session: dbSession })
            } else if (input.assignedNgoId && updated.assignedNgoId && !existing.assignedNgoId) {
              await Notification.create([{
                recipientId: updated.seekerId,
                message: `An NGO partner has accepted your support request "${updated.title}".`,
                type: 'info',
                link: '/dashboard?tab=my-requests',
              }], { session: dbSession })
            }
          }
        })
      } finally {
        await dbSession.endSession()
      }

      if (!updated) {
        response.status(409).json({ error: 'Request changed concurrently; reload and retry', requestId: request.id })
        return
      }

      const [serialized] = await serializeRequests([updated], user)
      response.setHeader('Cache-Control', 'no-store')
      response.json({ success: true, request: serialized })
    },
  )

  return router
}

export function createVerificationRouter(config: ServerConfig) {
  const router = Router()
  const authenticate = requireSession(config)
  const csrf = requireCsrf(config)
  const requireOrigin = requireFrontendOrigin(config)

  const verifyTarget = (role: 'ngo' | 'volunteer', pendingStatus: 'pending_verification' | 'pending_review') =>
    async (request: import('express').Request, response: import('express').Response) => {
      const targetId = singleRouteParam(request.params.id)
      if (!targetId || !isObjectId(targetId)) {
        response.status(404).json({ error: 'Verification target not found', requestId: request.id })
        return
      }
      const parsed = z.object({ status: z.enum(['verified', 'rejected']) }).strict().safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid verification decision', requestId: request.id })
        return
      }
      const dbSession = await mongoose.startSession()
      const transactionResult: { user: UserDocument | null } = { user: null }
      let conflict = false
      try {
        await dbSession.withTransaction(async () => {
          transactionResult.user = await User.findOneAndUpdate(
            {
              role,
              status: pendingStatus,
              $and: [
                { _id: targetId },
                { _id: { $ne: request.auth!.user.id } },
              ],
            },
            { $set: { status: parsed.data.status } },
            { returnDocument: 'after', runValidators: true, session: dbSession },
          )
          if (!transactionResult.user) {
            const target = await User.findOne({ _id: targetId, role }).select('status').session(dbSession)
            if (!target) return
            conflict = true
            await createAuditEvent(request.auth!.user, {
              action: 'verification.decision.conflict',
              targetType: 'user',
              targetId,
              outcome: 'conflict',
              fromStatus: target.status,
              toStatus: parsed.data.status,
              details: { targetRole: role },
            }, dbSession)
            return
          }
          await createAuditEvent(request.auth!.user, {
            action: 'verification.decision',
            targetType: 'user',
            targetId,
            fromStatus: pendingStatus,
            toStatus: parsed.data.status,
            details: { targetRole: role },
          }, dbSession)
          await Notification.create([{
            recipientId: new Types.ObjectId(targetId),
            message: parsed.data.status === 'verified'
              ? `Your ${role === 'ngo' ? 'organization' : 'volunteer profile'} has been verified! Welcome to UMEED.`
              : `Your ${role === 'ngo' ? 'organization' : 'volunteer profile'} verification was reviewed and not approved at this time.`,
            type: parsed.data.status === 'verified' ? 'success' : 'alert',
            link: '/dashboard',
          }], { session: dbSession })
        })
      } finally {
        await dbSession.endSession()
      }

      const verifiedUser = transactionResult.user
      if (!verifiedUser) {
        response.status(conflict ? 409 : 404).json({
          error: conflict ? 'Verification target is no longer pending review' : 'Verification target not found',
          requestId: request.id,
        })
        return
      }

      const safeUser = {
        id: verifiedUser._id.toString(),
        email: verifiedUser.email,
        role: verifiedUser.role,
        name: verifiedUser.name,
        city: verifiedUser.city,
        status: verifiedUser.status,
        createdAt: verifiedUser.createdAt.toISOString(),
        updatedAt: verifiedUser.updatedAt.toISOString(),
      }
      response.setHeader('Cache-Control', 'no-store')
      response.json(role === 'ngo'
        ? { success: true, ngo: safeUser }
        : { success: true, volunteer: safeUser })
    }

  router.patch(
    '/ngos/:id/verify',
    requireOrigin,
    authenticate,
    requireRoles('admin'),
    csrf,
    verifyTarget('ngo', 'pending_verification'),
  )
  router.patch(
    '/volunteers/:id/verify',
    requireOrigin,
    authenticate,
    requireRoles('admin'),
    csrf,
    verifyTarget('volunteer', 'pending_review'),
  )
  return router
}
