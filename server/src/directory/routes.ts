import { Types } from 'mongoose'
import { Router } from 'express'
import { z } from 'zod'
import type { ServerConfig } from '../config/env.js'
import { optionalSession } from '../auth/middleware.js'
import { AuditEvent } from '../models/audit-event.js'
import { User } from '../models/user.js'

const querySchema = z.object({
  city: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  all: z.enum(['true', 'false']).optional(),
}).strict()

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createDirectoryRouter(config: ServerConfig) {
  const router = Router()
  const optionalAuthenticate = optionalSession(config)

  router.get('/ngos', optionalAuthenticate, async (request, response) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid directory filters', requestId: request.id })
      return
    }

    const adminView = parsed.data.all === 'true'
    if (adminView && request.auth?.user.role !== 'admin') {
      response.status(request.auth ? 403 : 401).json({
        error: request.auth ? 'Forbidden' : 'Unauthorized',
        requestId: request.id,
      })
      return
    }

    if (adminView) {
      await AuditEvent.create({
        actorId: new Types.ObjectId(request.auth!.user.id),
        actorRole: 'admin',
        action: 'verification.queue.accessed',
        targetType: 'user',
        targetId: 'ngos',
        outcome: 'succeeded',
      })
    }

    const filter: Record<string, unknown> = adminView
      ? { role: 'ngo', status: 'pending_verification' }
      : { role: 'ngo', status: 'verified' }
    if (parsed.data.city) {
      const cityPattern = { $regex: `^${escapedRegex(parsed.data.city)}`, $options: 'i' }
      filter.$or = [{ city: cityPattern }, { operatingCity: cityPattern }]
    }
    if (parsed.data.category) {
      filter.areasOfSupport = parsed.data.category
    }

    const ngos = await User.find(filter)
      .select(adminView
        ? 'name orgName email phone city operatingCity contactPerson regNumber address areasOfSupport status createdAt'
        : 'name orgName city operatingCity areasOfSupport')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      ngos: ngos.map((ngo) => ({
        id: ngo._id.toString(),
        name: ngo.name,
        ...(ngo.orgName ? { orgName: ngo.orgName } : {}),
        city: ngo.city,
        ...(ngo.operatingCity ? { operatingCity: ngo.operatingCity } : {}),
        areasOfSupport: ngo.areasOfSupport,
        ...(adminView
          ? {
              email: ngo.email,
              phone: ngo.phone,
              contactPerson: ngo.contactPerson,
              regNumber: ngo.regNumber,
              address: ngo.address,
              status: ngo.status,
              createdAt: ngo.createdAt.toISOString(),
            }
          : {}),
      })),
    })
  })

  return router
}
