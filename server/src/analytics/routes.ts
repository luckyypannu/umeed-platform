import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import type { ServerConfig } from '../config/env.js'
import { requireRoles, requireSession } from '../auth/middleware.js'
import { SupportRequest } from '../models/support-request.js'
import { User } from '../models/user.js'
import { EmergencyRecord } from '../models/private-features.js'

const dateFilterSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
})

function buildDateRangeFilter(fromDate?: string, toDate?: string): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  if (fromDate || toDate) {
    const createdAtFilter: Record<string, Date> = {}
    if (fromDate) {
      const parsed = new Date(fromDate)
      if (!Number.isNaN(parsed.getTime())) createdAtFilter.$gte = parsed
    }
    if (toDate) {
      const parsed = new Date(toDate)
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999)
        createdAtFilter.$lte = parsed
      }
    }
    if (Object.keys(createdAtFilter).length > 0) {
      filter.createdAt = createdAtFilter
    }
  }
  return filter
}

export function createAnalyticsRouter(config: ServerConfig) {
  const router = Router()
  const authenticate = requireSession(config)

  router.get('/ngo', authenticate, requireRoles('ngo'), async (request, response) => {
    const user = request.auth!.user
    const ngoUser = await User.findOne({
      _id: user.id,
      role: 'ngo',
      status: 'verified',
    }).select('city operatingCity areasOfSupport orgName name').lean()

    if (!ngoUser) {
      response.status(403).json({ error: 'Verified NGO status is required', requestId: request.id })
      return
    }

    const queryParse = dateFilterSchema.safeParse(request.query)
    const { fromDate, toDate } = queryParse.success ? queryParse.data : {}
    const dateFilter = buildDateRangeFilter(fromDate, toDate)

    const ngoId = new Types.ObjectId(user.id)
    const city = ngoUser.operatingCity || ngoUser.city

    const incomingFilter: Record<string, unknown> = {
      assignedNgoId: null,
      city: { $regex: `^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      status: { $in: ['submitted', 'under_review'] },
      ...dateFilter,
    }
    if (ngoUser.areasOfSupport.length > 0) {
      incomingFilter.category = { $in: ngoUser.areasOfSupport }
    }

    const assignedBaseFilter: Record<string, unknown> = {
      assignedNgoId: ngoId,
      ...dateFilter,
    }

    const [
      incomingEligible,
      activeAssignments,
      completedDeliveries,
      pendingConfirmations,
      openDisputes,
      workloadAggregation,
      monthlyAggregation,
    ] = await Promise.all([
      SupportRequest.countDocuments(incomingFilter),
      SupportRequest.countDocuments({ ...assignedBaseFilter, status: 'in_progress' }),
      SupportRequest.countDocuments({
        ...assignedBaseFilter,
        status: { $in: ['verified_completed', 'resolved'] },
      }),
      SupportRequest.countDocuments({
        ...assignedBaseFilter,
        status: 'awaiting_beneficiary_verification',
      }),
      SupportRequest.countDocuments({
        ...assignedBaseFilter,
        status: 'beneficiary_reported_issue',
      }),
      SupportRequest.aggregate([
        {
          $match: {
            assignedNgoId: ngoId,
            assignedVolunteerId: { $ne: null },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: '$assignedVolunteerId',
            totalTasks: { $sum: 1 },
            activeTasks: {
              $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
            },
            completedTasks: {
              $sum: { $cond: [{ $in: ['$status', ['verified_completed', 'resolved']] }, 1, 0] },
            },
            avgRating: { $avg: '$rating' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'volunteer',
          },
        },
        {
          $project: {
            volunteerId: { $toString: '$_id' },
            volunteerName: {
              $ifNull: [{ $arrayElemAt: ['$volunteer.name', 0] }, 'Verified Volunteer'],
            },
            totalTasks: 1,
            activeTasks: 1,
            completedTasks: 1,
            avgRating: { $round: [{ $ifNull: ['$avgRating', 0] }, 1] },
          },
        },
        { $sort: { activeTasks: -1, totalTasks: -1 } },
        { $limit: 15 },
      ]),
      SupportRequest.aggregate([
        {
          $match: {
            assignedNgoId: ngoId,
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            totalAssigned: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $in: ['$status', ['verified_completed', 'resolved']] }, 1, 0] },
            },
            disputed: {
              $sum: { $cond: [{ $eq: ['$status', 'beneficiary_reported_issue'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

    const monthlyPerformance = monthlyAggregation.map((item) => ({
      month: String(item._id),
      totalAssigned: Number(item.totalAssigned) || 0,
      completed: Number(item.completed) || 0,
      disputed: Number(item.disputed) || 0,
    }))

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      analytics: {
        incomingEligible,
        activeAssignments,
        completedDeliveries,
        pendingConfirmations,
        openDisputes,
        volunteerWorkload: workloadAggregation,
        monthlyPerformance,
      },
    })
  })

  router.get('/admin', authenticate, requireRoles('admin'), async (request, response) => {
    const queryParse = dateFilterSchema.safeParse(request.query)
    const { fromDate, toDate } = queryParse.success ? queryParse.data : {}
    const dateFilter = buildDateRangeFilter(fromDate, toDate)

    const [
      growthAggregation,
      ngoPerformanceAggregation,
      outcomesAggregation,
      emergencyTotal,
      emergencyActive,
      emergencyWithResponders,
      disputeAggregation,
      pendingNgos,
      pendingVolunteers,
      totalVerifiedVolunteers,
      activeVolunteersList,
      totalCompletedVolunteerTasks,
      ratingAggregation,
    ] = await Promise.all([
      User.aggregate([
        { $match: { ...dateFilter } },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              role: '$role',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.month': 1 } },
      ]),
      SupportRequest.aggregate([
        {
          $match: {
            assignedNgoId: { $ne: null },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: '$assignedNgoId',
            totalHandled: { $sum: 1 },
            verifiedCompleted: {
              $sum: { $cond: [{ $in: ['$status', ['verified_completed', 'resolved']] }, 1, 0] },
            },
            disputes: {
              $sum: { $cond: [{ $eq: ['$status', 'beneficiary_reported_issue'] }, 1, 0] },
            },
            avgRating: { $avg: '$rating' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'ngo',
          },
        },
        {
          $project: {
            ngoId: { $toString: '$_id' },
            ngoName: {
              $ifNull: [
                { $arrayElemAt: ['$ngo.orgName', 0] },
                { $ifNull: [{ $arrayElemAt: ['$ngo.name', 0] }, 'NGO Partner'] },
              ],
            },
            city: {
              $ifNull: [
                { $arrayElemAt: ['$ngo.operatingCity', 0] },
                { $ifNull: [{ $arrayElemAt: ['$ngo.city', 0] }, 'Unspecified'] },
              ],
            },
            totalHandled: 1,
            verifiedCompleted: 1,
            disputes: 1,
            avgRating: { $round: [{ $ifNull: ['$avgRating', 0] }, 1] },
          },
        },
        { $sort: { totalHandled: -1 } },
        { $limit: 10 },
      ]),
      SupportRequest.aggregate([
        { $match: { ...dateFilter } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      EmergencyRecord.countDocuments({ ...dateFilter }),
      EmergencyRecord.countDocuments({ expiresAt: { $gt: new Date() }, ...dateFilter }),
      EmergencyRecord.countDocuments({
        'authorizedResponderIds.0': { $exists: true },
        ...dateFilter,
      }),
      SupportRequest.aggregate([
        {
          $match: {
            $or: [
              { status: 'beneficiary_reported_issue' },
              { issueDetails: { $exists: true, $ne: '' } },
            ],
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            resolved: {
              $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.countDocuments({ role: 'ngo', status: 'pending_verification' }),
      User.countDocuments({ role: 'volunteer', status: 'pending_review' }),
      User.countDocuments({ role: 'volunteer', status: 'verified' }),
      SupportRequest.distinct('assignedVolunteerId', {
        status: 'in_progress',
        assignedVolunteerId: { $ne: null },
        ...dateFilter,
      }),
      SupportRequest.countDocuments({
        status: { $in: ['verified_completed', 'resolved'] },
        assignedVolunteerId: { $ne: null },
        ...dateFilter,
      }),
      SupportRequest.aggregate([
        {
          $match: {
            rating: { $ne: null },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
          },
        },
      ]),
    ])

    const growthByMonth: Record<string, Record<string, number>> = {}
    for (const item of growthAggregation) {
      const month = item._id.month
      const role = item._id.role
      if (!growthByMonth[month]) growthByMonth[month] = { seeker: 0, volunteer: 0, ngo: 0, admin: 0 }
      growthByMonth[month][role] = item.count
    }

    const platformGrowth = Object.entries(growthByMonth).map(([month, roles]) => ({
      month,
      seekers: roles.seeker || 0,
      volunteers: roles.volunteer || 0,
      ngos: roles.ngo || 0,
    }))

    const requestOutcomes: Record<string, number> = {}
    for (const outcome of outcomesAggregation) {
      requestOutcomes[outcome._id] = outcome.count
    }

    const disputeTrends = disputeAggregation.map((item) => ({
      month: String(item._id),
      totalDisputes: Number(item.count) || 0,
      resolvedDisputes: Number(item.resolved) || 0,
    }))

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      analytics: {
        platformGrowth,
        ngoPerformance: ngoPerformanceAggregation,
        volunteerParticipation: {
          totalRegistered: totalVerifiedVolunteers,
          activeVolunteers: activeVolunteersList.length,
          completedTasks: totalCompletedVolunteerTasks,
          avgRating: Math.round(((ratingAggregation[0]?.avgRating ?? 0) * 10)) / 10,
        },
        requestOutcomes,
        emergencyActivity: {
          total: emergencyTotal,
          active: emergencyActive,
          respondersDispatched: emergencyWithResponders,
        },
        disputeTrends,
        verificationQueues: {
          pendingNgos,
          pendingVolunteers,
        },
      },
    })
  })

  return router
}
