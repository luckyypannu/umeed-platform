import mongoose, { Types } from 'mongoose'
import { Router } from 'express'
import { z } from 'zod'
import type { ServerConfig } from '../config/env.js'
import { requireCsrf, requireFrontendOrigin, requireRoles, requireSession, optionalSession } from '../auth/middleware.js'
import { User } from '../models/user.js'
import { AuditEvent } from '../models/audit-event.js'
import { VolunteerOpportunity } from '../models/volunteer-opportunity.js'
import { Notification } from '../models/private-features.js'

const querySchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(120).optional(),
}).strict()

const applySchema = z.object({
  opportunityId: z.string().regex(/^[a-f\d]{24}$/i),
}).strict()

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.string().trim().min(1).max(100),
  mode: z.enum(['In-person', 'Remote']),
  city: z.string().trim().min(1).max(120),
  description: z.string().trim().min(10).max(5000),
}).strict()

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function opportunityDto(
  opportunity: {
    _id: Types.ObjectId
    title: string
    category: string
    mode: string
    city: string
    description: string
    status: string
    applicants: Array<{ volunteerId: Types.ObjectId }>
    createdAt: Date
  },
  volunteerId?: string,
) {
  return {
    id: opportunity._id.toString(),
    title: opportunity.title,
    category: opportunity.category,
    mode: opportunity.mode,
    city: opportunity.city,
    description: opportunity.description,
    status: opportunity.status,
    applicantCount: opportunity.applicants.length,
    hasApplied: volunteerId
      ? opportunity.applicants.some((applicant) => applicant.volunteerId.toString() === volunteerId)
      : false,
    createdAt: opportunity.createdAt.toISOString(),
  }
}

export function createOpportunityRouter(config: ServerConfig) {
  const router = Router()
  const optionalAuthenticate = optionalSession(config)
  const authenticate = requireSession(config)
  const requireOrigin = requireFrontendOrigin(config)
  const csrf = requireCsrf(config)

  router.post(
    '/opportunities/create',
    requireOrigin,
    authenticate,
    requireRoles('ngo'),
    csrf,
    async (request, response) => {
      const parsed = createSchema.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid opportunity details', requestId: request.id })
        return
      }

      const creator = await User.findOne({
        _id: request.auth!.user.id,
        role: 'ngo',
        status: 'verified',
      }).select('_id')
      if (!creator) {
        response.status(403).json({ error: 'Verified NGO access is required', requestId: request.id })
        return
      }

      const dbSession = await mongoose.startSession()
      let opportunityId = ''
      try {
        await dbSession.withTransaction(async () => {
          const [opportunity] = await VolunteerOpportunity.create([{
            ...parsed.data,
            createdById: creator._id,
            status: 'open',
            applicants: [],
          }], { session: dbSession })
          opportunityId = opportunity._id.toString()
          await AuditEvent.create([{
            actorId: creator._id,
            actorRole: 'ngo',
            action: 'opportunity.created',
            targetType: 'opportunity',
            targetId: opportunityId,
            outcome: 'succeeded',
          }], { session: dbSession })
        })
      } finally {
        await dbSession.endSession()
      }

      const opportunity = await VolunteerOpportunity.findById(opportunityId)
      if (!opportunity) throw new Error('Opportunity was not persisted')
      response.setHeader('Cache-Control', 'no-store')
      response.status(201).json({
        success: true,
        opportunity: opportunityDto(opportunity),
      })
    },
  )

  router.get('/opportunities', optionalAuthenticate, async (request, response) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid opportunity filters', requestId: request.id })
      return
    }

    const ngoOwnerId =
      request.auth?.user.role === 'ngo' && request.auth.user.status === 'verified'
        ? new Types.ObjectId(request.auth.user.id)
        : null
    const filter: Record<string, unknown> = ngoOwnerId
      ? { createdById: ngoOwnerId }
      : { status: 'open' }
    if (parsed.data.category) filter.category = parsed.data.category
    if (parsed.data.city) filter.city = { $regex: `^${escapedRegex(parsed.data.city)}$`, $options: 'i' }

    const opportunities = await VolunteerOpportunity.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    const volunteerId =
      request.auth?.user.role === 'volunteer' && request.auth.user.status === 'verified'
        ? request.auth.user.id
        : undefined

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      opportunities: opportunities.map((opportunity) =>
        opportunityDto(opportunity, volunteerId),
      ),
    })
  })

  router.get(
    '/opportunities/:id/applicants',
    authenticate,
    requireRoles('ngo'),
    async (request, response) => {
      if (request.auth!.user.status !== 'verified') {
        response.status(403).json({ error: 'Verified NGO access is required', requestId: request.id })
        return
      }
      const id = typeof request.params.id === 'string' ? request.params.id : ''
      if (!Types.ObjectId.isValid(id)) {
        response.status(404).json({ error: 'Opportunity not found', requestId: request.id })
        return
      }
      const opportunity = await VolunteerOpportunity.findOne({
        _id: new Types.ObjectId(id),
        createdById: new Types.ObjectId(request.auth!.user.id),
      }).select('_id').lean()
      if (!opportunity) {
        response.status(404).json({ error: 'Opportunity not found', requestId: request.id })
        return
      }
      const applicants = await VolunteerOpportunity.aggregate([
        { $match: { _id: opportunity._id } },
        { $unwind: '$applicants' },
        {
          $lookup: {
            from: 'users',
            localField: 'applicants.volunteerId',
            foreignField: '_id',
            as: 'volunteer',
          },
        },
        { $unwind: '$volunteer' },
        {
          $project: {
            _id: 0,
            volunteerId: { $toString: '$volunteer._id' },
            name: '$volunteer.name',
            city: '$volunteer.city',
            status: '$applicants.status',
            appliedAt: '$applicants.appliedAt',
          },
        },
        { $sort: { appliedAt: -1 } },
        { $limit: 1000 },
      ])
      response.setHeader('Cache-Control', 'no-store')
      response.json({ success: true, applicants })
    },
  )

  router.patch(
    '/opportunities/:id/applicants',
    requireOrigin,
    authenticate,
    requireRoles('ngo'),
    csrf,
    async (request, response) => {
      if (request.auth!.user.status !== 'verified') {
        response.status(403).json({ error: 'Verified NGO access is required', requestId: request.id })
        return
      }
      const id = typeof request.params.id === 'string' ? request.params.id : ''
      const parsed = z.object({
        volunteerId: z.string().regex(/^[a-f\d]{24}$/i),
        status: z.literal('accepted'),
      }).strict().safeParse(request.body)
      if (!Types.ObjectId.isValid(id) || !parsed.success) {
        response.status(400).json({ error: 'Invalid application decision', requestId: request.id })
        return
      }
      const ownerId = new Types.ObjectId(request.auth!.user.id)
      const volunteerId = new Types.ObjectId(parsed.data.volunteerId)
      const dbSession = await mongoose.startSession()
      let updated = false
      try {
        await dbSession.withTransaction(async () => {
          const opportunity = await VolunteerOpportunity.findOneAndUpdate(
            {
              _id: new Types.ObjectId(id),
              createdById: ownerId,
              'applicants.volunteerId': volunteerId,
              'applicants.status': 'applied',
            },
            { $set: { 'applicants.$.status': 'accepted' } },
            { returnDocument: 'after', runValidators: true, session: dbSession },
          ).select('title applicants')
          if (!opportunity) return
          updated = true
          await Notification.create([{
            recipientId: volunteerId,
            message: `Your application for "${opportunity.title}" was accepted.`,
            type: 'success',
            link: '/dashboard?role=volunteer&tab=volunteer-opportunities',
            read: false,
          }], { session: dbSession })
          await AuditEvent.create([{
            actorId: ownerId,
            actorRole: 'ngo',
            action: 'opportunity.application.accepted',
            targetType: 'opportunity',
            targetId: id,
            outcome: 'succeeded',
            details: { volunteerId: volunteerId.toString() },
          }], { session: dbSession })
        })
      } finally {
        await dbSession.endSession()
      }
      if (!updated) {
        response.status(404).json({ error: 'Application not found or no longer eligible', requestId: request.id })
        return
      }
      response.setHeader('Cache-Control', 'no-store')
      response.json({ success: true, status: 'accepted' })
    },
  )

  router.post(
    '/opportunities',
    requireOrigin,
    authenticate,
    requireRoles('volunteer'),
    csrf,
    async (request, response) => {
      const parsed = applySchema.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid opportunity application', requestId: request.id })
        return
      }

      const volunteerId = new Types.ObjectId(request.auth!.user.id)
      const volunteer = await User.findOne({
        _id: volunteerId,
        role: 'volunteer',
        status: 'verified',
      }).select('_id')
      if (!volunteer) {
        response.status(403).json({ error: 'Verified volunteer access is required', requestId: request.id })
        return
      }

      const opportunity = await VolunteerOpportunity.findOneAndUpdate(
        {
          _id: new Types.ObjectId(parsed.data.opportunityId),
          status: 'open',
          'applicants.volunteerId': { $ne: volunteerId },
          $expr: { $lt: [{ $size: '$applicants' }, 1000] },
        },
        {
          $push: {
            applicants: {
              volunteerId,
              status: 'applied',
              appliedAt: new Date(),
            },
          },
        },
        { returnDocument: 'after', runValidators: true },
      )

      if (!opportunity) {
        const existing = await VolunteerOpportunity.findById(parsed.data.opportunityId)
          .select('status applicants.volunteerId')
          .lean()
        if (existing?.applicants.some(
          (applicant: { volunteerId: Types.ObjectId }) => applicant.volunteerId.equals(volunteerId),
        )) {
          response.status(409).json({ error: 'You have already applied to this opportunity', requestId: request.id })
        } else {
          response.status(404).json({ error: 'Opportunity is unavailable', requestId: request.id })
        }
        return
      }

      await Notification.create([{
        recipientId: opportunity.createdById,
        message: `A volunteer applied to your opportunity "${opportunity.title}".`,
        type: 'info',
        link: '/dashboard?tab=opportunity-applications',
        read: false,
      }])

      response.setHeader('Cache-Control', 'no-store')
      response.status(201).json({
        success: true,
        opportunity: opportunityDto(opportunity, request.auth!.user.id),
      })
    },
  )

  return router
}
