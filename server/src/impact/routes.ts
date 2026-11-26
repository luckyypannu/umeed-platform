import { Router } from 'express'
import { SupportRequest } from '../models/support-request.js'
import { User } from '../models/user.js'

type ImpactResponse = {
  success: true
  stats: {
    totalRequests: number
    resolvedRequests: number
    verifiedCompletedRequests: number
    partiallyCompletedRequests: number
    inProgressRequests: number
    awaitingConfirmationRequests: number
    pendingRequests: number
    openDisputes: number
    registeredNgos: number
    activeVolunteers: number
    totalRegisteredUsers: number
    citiesCovered: number
    categoryBreakdown: Record<string, number>
    statusBreakdown: Record<string, number>
  }
}

export function createImpactRouter() {
  const router = Router()
  let cached: { expiresAt: number; response: ImpactResponse } | null = null

  router.get('/impact', async (_request, response) => {
    if (cached && cached.expiresAt > Date.now()) {
      response.setHeader('Cache-Control', 'no-store')
      response.json(cached.response)
      return
    }

    const [requestStats, registeredNgos, activeVolunteers, totalRegisteredUsers] = await Promise.all([
      SupportRequest.aggregate([
        {
          $facet: {
            counts: [
              {
                $group: {
                  _id: null,
                  totalRequests: { $sum: 1 },
                  resolvedRequests: {
                    $sum: { $cond: [{ $in: ['$status', ['resolved', 'verified_completed']] }, 1, 0] },
                  },
                  verifiedCompletedRequests: {
                    $sum: { $cond: [{ $eq: ['$status', 'verified_completed'] }, 1, 0] },
                  },
                  partiallyCompletedRequests: {
                    $sum: { $cond: [{ $eq: ['$status', 'partially_completed'] }, 1, 0] },
                  },
                  inProgressRequests: {
                    $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
                  },
                  awaitingConfirmationRequests: {
                    $sum: { $cond: [{ $eq: ['$status', 'awaiting_beneficiary_verification'] }, 1, 0] },
                  },
                  pendingRequests: {
                    $sum: { $cond: [{ $in: ['$status', ['submitted', 'under_review']] }, 1, 0] },
                  },
                  openDisputes: {
                    $sum: { $cond: [{ $eq: ['$status', 'beneficiary_reported_issue'] }, 1, 0] },
                  },
                },
              },
            ],
            categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
            statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            cities: [
              {
                $group: {
                  _id: { $toLower: { $trim: { input: { $ifNull: ['$city', ''] } } } },
                },
              },
              { $match: { _id: { $ne: '' } } },
              { $count: 'count' },
            ],
          },
        },
      ]),
      User.countDocuments({ role: 'ngo', status: 'verified' }),
      User.countDocuments({ role: 'volunteer', status: 'verified' }),
      User.countDocuments({}),
    ])
    const counts = requestStats[0]?.counts[0]
    const categoryBreakdown: Record<string, number> = {}
    for (const category of requestStats[0]?.categories ?? []) {
      categoryBreakdown[category._id] = category.count
    }
    const statusBreakdown: Record<string, number> = {}
    for (const status of requestStats[0]?.statuses ?? []) {
      statusBreakdown[status._id] = status.count
    }

    const result: ImpactResponse = {
      success: true,
      stats: {
        totalRequests: counts?.totalRequests ?? 0,
        resolvedRequests: counts?.resolvedRequests ?? 0,
        verifiedCompletedRequests: counts?.verifiedCompletedRequests ?? 0,
        partiallyCompletedRequests: counts?.partiallyCompletedRequests ?? 0,
        inProgressRequests: counts?.inProgressRequests ?? 0,
        awaitingConfirmationRequests: counts?.awaitingConfirmationRequests ?? 0,
        pendingRequests: counts?.pendingRequests ?? 0,
        openDisputes: counts?.openDisputes ?? 0,
        registeredNgos,
        activeVolunteers,
        totalRegisteredUsers,
        citiesCovered: requestStats[0]?.cities[0]?.count ?? 0,
        categoryBreakdown,
        statusBreakdown,
      },
    }
    cached = { expiresAt: Date.now() + 45_000, response: result }
    response.setHeader('Cache-Control', 'no-store')
    response.json(result)
  })

  return router
}
