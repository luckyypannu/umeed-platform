import { Router } from 'express'
import { SupportRequest } from '../models/support-request.js'
import { User } from '../models/user.js'

export function createImpactRouter() {
  const router = Router()

  router.get('/impact', async (_request, response) => {
    const [requestCounts, registeredNgos, activeVolunteers, totalRegisteredUsers, cityCounts] = await Promise.all([
      SupportRequest.aggregate([
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
            categoryBreakdown: { $push: '$category' },
            statusBreakdown: { $push: '$status' },
          },
        },
      ]),
      User.countDocuments({ role: 'ngo', status: 'verified' }),
      User.countDocuments({ role: 'volunteer', status: 'verified' }),
      User.countDocuments({}),
      SupportRequest.distinct('city'),
    ])
    const counts = requestCounts[0]
    const categoryBreakdown: Record<string, number> = {}
    for (const category of counts?.categoryBreakdown ?? []) {
      categoryBreakdown[category] = (categoryBreakdown[category] ?? 0) + 1
    }
    const statusBreakdown: Record<string, number> = {}
    for (const status of counts?.statusBreakdown ?? []) {
      statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1
    }

    response.setHeader('Cache-Control', 'no-store')
    response.json({
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
        citiesCovered: cityCounts.length,
        categoryBreakdown,
        statusBreakdown,
      },
    })
  })

  return router
}
