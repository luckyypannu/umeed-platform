import { randomBytes } from 'node:crypto'
import mongoose, { Types } from 'mongoose'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import type { ServerConfig } from '../config/env.js'
import { AuditEvent } from '../models/audit-event.js'
import { EmergencyRecord, ChatSession, Notification } from '../models/private-features.js'
import { User } from '../models/user.js'
import { hashSessionToken } from '../auth/crypto.js'
import {
  optionalSession,
  requireCsrf,
  requireFrontendOrigin,
  requireRoles,
  requireSession,
} from '../auth/middleware.js'

const EMERGENCY_COOKIE = 'umeed_emergency'
const CHAT_COOKIE = 'umeed_chat_session'
const emergencyLifetimeMs = 24 * 60 * 60 * 1000
const chatLifetimeMs = 24 * 60 * 60 * 1000

function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.cookie?.split(';') ?? []
  const matching = cookies.filter((part) => part.trim().startsWith(`${name}=`))
  if (matching.length !== 1) return null
  const value = matching[0].trim().slice(name.length + 1)
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null
}

function setCapabilityCookie(
  response: Response,
  name: string,
  token: string,
  maxAgeSeconds: number,
  config: ServerConfig,
): void {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : ''
  response.append(
    'Set-Cookie',
    `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`,
  )
}

function clearCapabilityCookie(response: Response, name: string, config: ServerConfig): void {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : ''
  response.append(
    'Set-Cookie',
    `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  )
}

function credentialHash(token: string, config: ServerConfig): string {
  return hashSessionToken(token, config.SESSION_SECRET)
}

async function writeAudit(
  request: Request,
  action: string,
  targetId: string,
): Promise<void> {
  const actor = request.auth?.user
  await AuditEvent.create({
    actorId: actor ? new Types.ObjectId(actor.id) : null,
    actorRole: actor?.role ?? 'anonymous',
    action,
    targetType: 'emergency',
    targetId,
    outcome: 'succeeded',
  })
}

const emergencyInput = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100000).optional(),
  consent: z.literal(true),
}).strict()

function emergencyDto(record: {
  _id: Types.ObjectId
  latitude: number
  longitude: number
  accuracy: number | null
  authorizedResponderIds: Types.ObjectId[]
  expiresAt: Date
  createdAt: Date
}, precise: boolean, includeResponderIds = false) {
  const value = (coordinate: number) => precise ? coordinate : Math.round(coordinate * 100) / 100
  return {
    id: record._id.toString(),
    latitude: value(record.latitude),
    longitude: value(record.longitude),
    ...(precise && record.accuracy !== null ? { accuracy: record.accuracy } : {}),
    expiresAt: record.expiresAt.toISOString(),
    ...(includeResponderIds
      ? { authorizedResponderIds: record.authorizedResponderIds.map((id) => id.toString()) }
      : {}),
    status: 'active' as const,
    createdAt: record.createdAt.toISOString(),
  }
}

async function emergencyScope(
  request: Request,
  config: ServerConfig,
): Promise<{ filter: Record<string, unknown> } | null> {
  const user = request.auth?.user
  const activeRecordFilter = { expiresAt: { $gt: new Date() } }
  if (user?.role === 'admin') {
    return { filter: activeRecordFilter }
  }
  if (user) {
    const ownerFilter = { ownerUserId: new Types.ObjectId(user.id) }
    const canRespond =
      ['ngo', 'volunteer'].includes(user.role) && user.status === 'verified'
    return {
      filter: {
        $and: [
          activeRecordFilter,
          canRespond
            ? {
                $or: [
                  ownerFilter,
                  { authorizedResponderIds: new Types.ObjectId(user.id) },
                ],
              }
            : ownerFilter,
        ],
      },
    }
  }
  const token = readCookie(request, EMERGENCY_COOKIE)
  if (!token) return null
  return {
    filter: {
      ownerCredentialHash: credentialHash(token, config),
      expiresAt: { $gt: new Date() },
    },
  }
}

const volunteerProfileInput = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  skills: z.string().trim().max(1000).optional(),
  interests: z.string().trim().max(1000).optional(),
  categories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  availableDays: z.string().trim().max(200).optional(),
  motivation: z.string().trim().max(2000).optional(),
}).strict().refine((value) => Object.values(value).some((item) => item !== undefined))

const emergencyResponderInput = z.object({
  responderIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(20),
}).strict()

const notificationInput = z.object({
  notificationId: z.string().regex(/^[a-f\d]{24}$/i),
}).strict()

function chatReply(text: string): string {
  const query = text.toLowerCase()
  if (query.includes('emergency') || query.includes('danger') || query.includes('112')) {
    return 'For immediate danger, contact local emergency services directly. UMEED does not dispatch emergency services.'
  }
  if (query.includes('request') || query.includes('help') || query.includes('madad')) {
    return 'You can submit a support request from the Get Help page and view your requests in your dashboard.'
  }
  if (query.includes('volunteer') || query.includes('join')) {
    return 'You can create a volunteer account from the Volunteer registration page. Verified volunteer profiles may appear in the public directory.'
  }
  if (query.includes('ngo') || query.includes('organization')) {
    return 'Organizations can register through the NGO portal. Verification is required before accessing eligible support requests.'
  }
  if (query.includes('hello') || query.includes('hi') || query.includes('namaste')) {
    return 'Hello. I can help explain how to use UMEED support features.'
  }
  return 'I can provide basic guidance about UMEED requests, volunteers, NGOs, and emergency information. This is a rule-based assistant, not a human or AI-powered service.'
}

function safeChatMessage(message: {
  _id: Types.ObjectId
  sender: 'user' | 'assistant'
  text: string
  timestamp: Date
}) {
  return {
    id: message._id.toString(),
    sender: message.sender,
    text: message.text,
    timestamp: message.timestamp.toISOString(),
  }
}

async function getOrCreateChatSession(
  request: Request,
  response: Response,
  config: ServerConfig,
) {
  const token = readCookie(request, CHAT_COOKIE)
  if (token) {
    const session = await ChatSession.findOne({
      credentialHash: credentialHash(token, config),
      expiresAt: { $gt: new Date() },
    }).select('+credentialHash')
    if (session) return session
    clearCapabilityCookie(response, CHAT_COOKIE, config)
    return null
  }

  const nextToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + chatLifetimeMs)
  const session = await ChatSession.create({
    credentialHash: credentialHash(nextToken, config),
    messages: [],
    expiresAt,
  })
  setCapabilityCookie(response, CHAT_COOKIE, nextToken, chatLifetimeMs / 1000, config)
  return session
}

export function createPrivateFeatureRouter(config: ServerConfig) {
  const router = Router()
  const authenticate = requireSession(config)
  const optionalAuthenticate = optionalSession(config)
  const csrf = requireCsrf(config)
  const sensitiveReadLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sensitive record requests. Please try again later.' },
  })
  const sensitiveWriteLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sensitive actions. Please try again later.' },
  })
  const requireOrigin = requireFrontendOrigin(config)
  const csrfForAuthenticated = (request: Request, response: Response, next: (error?: unknown) => void) => {
    if (!request.auth) {
      next()
      return
    }
    csrf(request, response, next)
  }

  router.get('/emergency', sensitiveReadLimit, optionalAuthenticate, async (request, response) => {
    if (Object.keys(request.query).length > 0) {
      response.status(400).json({ error: 'Emergency records do not accept client-supplied ownership filters', requestId: request.id })
      return
    }
    const scope = await emergencyScope(request, config)
    if (!scope) {
      response.status(401).json({ error: 'Emergency record access is not authorized', requestId: request.id })
      return
    }
    if (request.auth && !['seeker', 'ngo', 'volunteer', 'admin'].includes(request.auth.user.role)) {
      response.status(403).json({ error: 'Forbidden', requestId: request.id })
      return
    }
    const records = await EmergencyRecord.find(scope.filter).sort({ createdAt: -1 }).limit(50)
    if (request.auth?.user.role === 'admin') {
      await writeAudit(request, 'emergency.records.listed', 'collection')
    }
    for (const record of records) {
      await writeAudit(request, 'emergency.record.accessed', record._id.toString())
    }
    const user = request.auth?.user
    const serialized = records.map((record) => {
      const owner =
        user?.role === 'admin' ||
        (user ? record.ownerUserId?.toString() === user.id : true)
      return emergencyDto(record, owner, user?.role === 'admin')
    })
    response.setHeader('Cache-Control', 'no-store')
    response.json({ success: true, alerts: serialized })
  })

  router.post(
    '/emergency',
    requireOrigin,
    sensitiveWriteLimit,
    optionalAuthenticate,
    csrfForAuthenticated,
    async (request, response) => {
      const parsed = emergencyInput.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Valid coordinates and explicit consent are required', requestId: request.id })
        return
      }
      const user = request.auth?.user
      let ownerCredentialHash = ''
      const expiresAt = new Date(Date.now() + emergencyLifetimeMs)
      if (!user) {
        let token = readCookie(request, EMERGENCY_COOKIE)
        const existingCredential = token
          ? await EmergencyRecord.exists({
              ownerCredentialHash: credentialHash(token, config),
              expiresAt: { $gt: new Date() },
            })
          : null
        if (!token || !existingCredential) {
          token = randomBytes(32).toString('base64url')
          setCapabilityCookie(response, EMERGENCY_COOKIE, token, emergencyLifetimeMs / 1000, config)
        }
        ownerCredentialHash = credentialHash(token, config)
      }
      const dbSession = await mongoose.startSession()
      let createdId = ''
      try {
        await dbSession.withTransaction(async () => {
          const [record] = await EmergencyRecord.create([{
            ownerUserId: user ? new Types.ObjectId(user.id) : null,
            ownerCredentialHash,
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
            accuracy: parsed.data.accuracy ?? null,
            consentAt: new Date(),
            authorizedResponderIds: [],
            expiresAt,
          }], { session: dbSession })
          createdId = record._id.toString()
          await AuditEvent.create([{
            actorId: user ? new Types.ObjectId(user.id) : null,
            actorRole: user?.role ?? 'anonymous',
            action: 'emergency.record.created',
            targetType: 'emergency',
            targetId: createdId,
            outcome: 'succeeded',
          }], { session: dbSession })
        })
      } finally {
        await dbSession.endSession()
      }
      const record = await EmergencyRecord.findById(createdId)
      if (!record) throw new Error('Emergency record was not persisted')
      response.setHeader('Cache-Control', 'no-store')
      response.status(201).json({
        success: true,
        alert: emergencyDto(record, true),
        message: 'Your location was saved as a private UMEED record. UMEED does not contact or dispatch emergency services.',
      })
    },
  )

  router.delete(
    '/emergency/:id',
    requireOrigin,
    sensitiveWriteLimit,
    optionalAuthenticate,
    csrfForAuthenticated,
    async (request, response) => {
      if (typeof request.params.id !== 'string' || !Types.ObjectId.isValid(request.params.id)) {
        response.status(404).json({ error: 'Emergency record not found', requestId: request.id })
        return
      }
      const user = request.auth?.user
      const token = user ? null : readCookie(request, EMERGENCY_COOKIE)
      const ownerFilter = user
        ? { ownerUserId: new Types.ObjectId(user.id) }
        : token
          ? {
              ownerCredentialHash: credentialHash(token, config),
              expiresAt: { $gt: new Date() },
            }
          : null
      if (!user && !ownerFilter) {
        response.status(401).json({ error: 'Emergency record access is not authorized', requestId: request.id })
        return
      }
      if (user && user.role !== 'admin' && !['seeker', 'ngo', 'volunteer'].includes(user.role)) {
        response.status(403).json({ error: 'Forbidden', requestId: request.id })
        return
      }
      const filter = user?.role === 'admin'
        ? { _id: new Types.ObjectId(request.params.id) }
        : { _id: new Types.ObjectId(request.params.id), ...ownerFilter }
      const dbSession = await mongoose.startSession()
      let deleted = false
      try {
        await dbSession.withTransaction(async () => {
          const record = await EmergencyRecord.findOneAndDelete(filter, { session: dbSession })
          if (!record) return
          deleted = true
          await AuditEvent.create([{
            actorId: user ? new Types.ObjectId(user.id) : null,
            actorRole: user?.role ?? 'anonymous',
            action: 'emergency.record.deleted',
            targetType: 'emergency',
            targetId: record._id.toString(),
            outcome: 'succeeded',
          }], { session: dbSession })
        })
      } finally {
        await dbSession.endSession()
      }
      if (!deleted) {
        response.status(404).json({ error: 'Emergency record not found', requestId: request.id })
        return
      }
      response.setHeader('Cache-Control', 'no-store')
      response.status(204).end()
    },
  )

  router.patch(
    '/emergency/:id/responders',
    requireOrigin,
    sensitiveWriteLimit,
    authenticate,
    requireRoles('admin'),
    csrf,
    async (request, response) => {
      const id = typeof request.params.id === 'string' ? request.params.id : ''
      if (!Types.ObjectId.isValid(id)) {
        response.status(404).json({ error: 'Emergency record not found', requestId: request.id })
        return
      }
      const parsed = emergencyResponderInput.safeParse(request.body)
      if (!parsed.success || new Set(parsed.data.responderIds).size !== parsed.data.responderIds.length) {
        response.status(400).json({ error: 'Invalid emergency responder list', requestId: request.id })
        return
      }
      const responderIds = parsed.data.responderIds.map((value) => new Types.ObjectId(value))
      const verifiedResponders = responderIds.length
        ? await User.find({
            _id: { $in: responderIds },
            role: { $in: ['ngo', 'volunteer'] },
            status: 'verified',
          }).select('_id').lean()
        : []
      if (verifiedResponders.length !== responderIds.length) {
        response.status(400).json({ error: 'Responders must be verified NGOs or volunteers', requestId: request.id })
        return
      }
      const dbSession = await mongoose.startSession()
      let updated = false
      try {
        await dbSession.withTransaction(async () => {
          const record = await EmergencyRecord.findByIdAndUpdate(
            { _id: id, expiresAt: { $gt: new Date() } },
            { $set: { authorizedResponderIds: responderIds } },
            { returnDocument: 'after', runValidators: true, session: dbSession },
          )
          if (!record) return
          updated = true
          await AuditEvent.create([{
            actorId: new Types.ObjectId(request.auth!.user.id),
            actorRole: 'admin',
            action: 'emergency.responders.authorized',
            targetType: 'emergency',
            targetId: id,
            outcome: 'succeeded',
            details: { responderCount: String(responderIds.length) },
          }], { session: dbSession })
          for (const respId of responderIds) {
            await Notification.create([{
              recipientId: respId,
              message: 'You have been authorized as an emergency responder for an urgent community alert.',
              type: 'alert',
              link: '/emergency',
              read: false,
            }], { session: dbSession })
          }
        })
      } finally {
        await dbSession.endSession()
      }
      if (!updated) {
        response.status(404).json({ error: 'Emergency record not found', requestId: request.id })
        return
      }
      response.setHeader('Cache-Control', 'no-store')
      response.json({ success: true })
    },
  )

  router.get('/chat', async (request, response) => {
    if (Object.keys(request.query).length > 0) {
      response.status(400).json({ error: 'Chat history does not accept session identifiers', requestId: request.id })
      return
    }
    const session = await getOrCreateChatSession(request, response, config)
    if (!session) {
      response.status(401).json({ error: 'Chat session expired; start a new conversation', requestId: request.id })
      return
    }
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      messages: session.messages.map(safeChatMessage),
      assistantType: 'rule-based',
    })
  })

  router.post('/chat', requireOrigin, sensitiveWriteLimit, async (request, response) => {
    const parsed = z.object({ text: z.string().trim().min(1).max(1000) }).strict().safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'A valid chat message is required', requestId: request.id })
      return
    }
    const session = await getOrCreateChatSession(request, response, config)
    if (!session) {
      response.status(401).json({ error: 'Chat session expired; start a new conversation', requestId: request.id })
      return
    }
    const now = new Date()
    const userMessage = { sender: 'user' as const, text: parsed.data.text, timestamp: now }
    const assistantMessage = {
      sender: 'assistant' as const,
      text: chatReply(parsed.data.text),
      timestamp: new Date(),
    }
    const updated = await ChatSession.findOneAndUpdate(
      {
        _id: session._id,
        expiresAt: { $gt: now },
        'messages.199': { $exists: false },
      },
      { $push: { messages: { $each: [userMessage, assistantMessage] } } },
      { returnDocument: 'after', runValidators: true },
    )
    if (!updated) {
      response.status(409).json({ error: 'Chat session expired or has reached its message limit', requestId: request.id })
      return
    }
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      userMessage: safeChatMessage(updated.messages[updated.messages.length - 2]),
      assistantMessage: safeChatMessage(updated.messages[updated.messages.length - 1]),
      assistantType: 'rule-based',
    })
  })

  router.delete('/chat', requireOrigin, optionalAuthenticate, csrfForAuthenticated, async (request, response) => {
    const token = readCookie(request, CHAT_COOKIE)
    if (!token) {
      response.status(404).json({ error: 'Chat session not found', requestId: request.id })
      return
    }
    const cleared = await ChatSession.findOneAndUpdate(
      {
        credentialHash: credentialHash(token, config),
        expiresAt: { $gt: new Date() },
      },
      { $set: { messages: [] } },
      { returnDocument: 'after' },
    ).select('_id')
    if (!cleared) {
      clearCapabilityCookie(response, CHAT_COOKIE, config)
      response.status(401).json({ error: 'Chat session expired', requestId: request.id })
      return
    }
    response.setHeader('Cache-Control', 'no-store')
    response.json({ success: true })
  })

  router.get('/volunteers', optionalAuthenticate, async (request, response) => {
    const all = request.query.all
    if (Object.keys(request.query).some((key) => key !== 'all') || (all !== undefined && all !== 'true')) {
      response.status(400).json({ error: 'Invalid volunteer directory options', requestId: request.id })
      return
    }

    const adminView = all === 'true'
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
        targetId: 'volunteers',
        outcome: 'succeeded',
      })
    }

    const volunteers = await User.find(adminView
      ? { role: 'volunteer', status: 'pending_review' }
      : { role: 'volunteer', status: 'verified' })
      .select(adminView
        ? 'name email phone city skills interests availableDays areasOfSupport status createdAt'
        : 'name city')
      .sort({ name: 1 })
      .limit(200)
      .lean()
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      volunteers: volunteers.map((volunteer) => ({
          id: volunteer._id.toString(),
          name: volunteer.name,
          city: volunteer.city,
          ...(adminView
            ? {
                skills: volunteer.skills,
                areasOfSupport: volunteer.areasOfSupport,
                email: volunteer.email,
                phone: volunteer.phone,
                interests: volunteer.interests,
                availableDays: volunteer.availableDays,
                status: volunteer.status,
                createdAt: volunteer.createdAt.toISOString(),
              }
            : {}),
        })),
    })
  })

  router.post(
    '/volunteers',
    requireOrigin,
    authenticate,
    requireRoles('volunteer'),
    csrf,
    async (request, response) => {
      const parsed = volunteerProfileInput.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid volunteer profile', requestId: request.id })
        return
      }
      const input = parsed.data
      const update = {
        ...(input.name ?? input.fullName ? { name: input.name ?? input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.locality !== undefined ? { locality: input.locality } : {}),
        ...(input.skills !== undefined ? { skills: input.skills } : {}),
        ...(input.interests !== undefined ? { interests: input.interests } : {}),
        ...(input.categories !== undefined ? { areasOfSupport: input.categories } : {}),
        ...(input.availableDays !== undefined ? { availableDays: input.availableDays } : {}),
        ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
      }
      const volunteer = await User.findOneAndUpdate(
        { _id: request.auth!.user.id, role: 'volunteer' },
        { $set: update },
        { returnDocument: 'after', runValidators: true },
      ).select('name email phone city locality skills interests areasOfSupport availableDays motivation status')
      if (!volunteer) {
        response.status(404).json({ error: 'Volunteer profile not found', requestId: request.id })
        return
      }
      response.setHeader('Cache-Control', 'no-store')
      response.json({
        success: true,
        volunteer: {
          id: volunteer._id.toString(),
          email: volunteer.email,
          name: volunteer.name,
          phone: volunteer.phone,
          city: volunteer.city,
          locality: volunteer.locality,
          skills: volunteer.skills,
          interests: volunteer.interests,
          areasOfSupport: volunteer.areasOfSupport,
          availableDays: volunteer.availableDays,
          motivation: volunteer.motivation,
          status: volunteer.status,
        },
      })
    },
  )

  router.get('/notifications', authenticate, async (request, response) => {
    if (Object.keys(request.query).length > 0) {
      response.status(400).json({ error: 'Notifications do not accept client-supplied recipient filters', requestId: request.id })
      return
    }
    const notifications = await Notification.find({
      recipientId: new Types.ObjectId(request.auth!.user.id),
    }).sort({ createdAt: -1 }).limit(100).lean()
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      notifications: notifications.map((item) => ({
        id: item._id.toString(),
        message: item.message,
        type: item.type,
        ...(item.link ? { link: item.link } : {}),
        read: item.read,
        createdAt: item.createdAt.toISOString(),
      })),
    })
  })

  router.get('/audit-events', authenticate, requireRoles('admin'), async (request, response) => {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).strict().safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid audit log options', requestId: request.id })
      return
    }
    const events = await AuditEvent.find({})
      .select('actorId actorRole action targetType targetId outcome fromStatus toStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(parsed.data.limit)
      .lean()
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      events: events.map((event) => ({
        id: event._id.toString(),
        actorId: event.actorId?.toString() ?? null,
        actorRole: event.actorRole,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        outcome: event.outcome,
        ...(event.fromStatus ? { fromStatus: event.fromStatus } : {}),
        ...(event.toStatus ? { toStatus: event.toStatus } : {}),
        createdAt: event.createdAt.toISOString(),
      })),
    })
  })

  router.post(
    '/notifications',
    requireOrigin,
    authenticate,
    csrf,
    async (request, response) => {
      const parsed = notificationInput.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Invalid notification update', requestId: request.id })
        return
      }
      const updated = await Notification.findOneAndUpdate(
        {
          _id: new Types.ObjectId(parsed.data.notificationId),
          recipientId: new Types.ObjectId(request.auth!.user.id),
        },
        { $set: { read: true } },
        { returnDocument: 'after', runValidators: true },
      ).select('_id read')
      if (!updated) {
        response.status(404).json({ error: 'Notification not found', requestId: request.id })
        return
      }
      response.setHeader('Cache-Control', 'no-store')
      response.json({ success: true })
    },
  )

  return router
}
