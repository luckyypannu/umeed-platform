import { Router } from 'express'
import { z } from 'zod'
import type { ServerConfig } from '../config/env.js'
import { Session } from '../models/session.js'
import { User, type UserDocument, type UserRole, type UserStatus } from '../models/user.js'
import {
  createCompatibilityToken,
  createCsrfToken,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  sessionExpiresAt,
  verifyPassword,
  verifyUnknownUserPassword,
} from './crypto.js'
import {
  clearSessionCookie,
  createLoginRateLimiter,
  createRegistrationRateLimiter,
  requireCsrf,
  requireFrontendOrigin,
  requireSession,
  setSessionCookie,
} from './middleware.js'

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase())
const passwordSchema = z.string().min(8).max(128)
const shortText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional()
const profileText = (max: number) => z.string().trim().min(1).max(max).optional()
const areasSchema = z.array(shortText(80)).max(30).optional()

const registrationSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('seeker'),
    email: emailSchema,
    password: passwordSchema,
    fullName: shortText(120),
    phone: shortText(32),
    city: shortText(120),
    locality: shortText(120),
  }).strict(),
  z.object({
    role: z.literal('volunteer'),
    email: emailSchema,
    password: passwordSchema,
    fullName: shortText(120),
    phone: shortText(32),
    city: shortText(120),
    locality: shortText(120),
    skills: optionalText(1000),
    interests: optionalText(1000),
    availableDays: optionalText(200),
    areasOfSupport: areasSchema,
  }).strict(),
  z.object({
    role: z.literal('ngo'),
    officialEmail: emailSchema,
    password: passwordSchema,
    orgName: shortText(160),
    contactPerson: shortText(120),
    phone: shortText(32),
    regNumber: optionalText(80),
    address: shortText(500),
    operatingCity: shortText(120),
    areasOfSupport: areasSchema,
  }).strict(),
])

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  role: z.enum(['seeker', 'ngo', 'volunteer', 'admin']).optional(),
}).strict()

const profileUpdateSchema = z.object({
  name: profileText(120),
  phone: profileText(32),
  city: profileText(120),
  locality: optionalText(120),
  address: optionalText(500),
  operatingCity: optionalText(120),
  areasOfSupport: areasSchema,
  skills: optionalText(1000),
  interests: optionalText(1000),
  availableDays: optionalText(200),
  orgName: optionalText(160),
  contactPerson: optionalText(120),
}).strict().refine(
  (update) => Object.values(update).some((value) => value !== undefined),
  'At least one profile field is required',
)

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  )
}

function statusForRole(role: Exclude<UserRole, 'admin'>): UserStatus {
  if (role === 'ngo') return 'pending_verification'
  if (role === 'volunteer') return 'pending_review'
  return 'active'
}

function publicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone,
    city: user.city,
    locality: user.locality,
    address: user.address,
    orgName: user.orgName,
    contactPerson: user.contactPerson,
    regNumber: user.regNumber,
    operatingCity: user.operatingCity,
    areasOfSupport: user.areasOfSupport,
    skills: user.skills,
    interests: user.interests,
    availableDays: user.availableDays,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

function compatibilityToken(user: UserDocument, config: ServerConfig): string {
  return createCompatibilityToken(
    { id: user._id.toString(), email: user.email, role: user.role },
    config.JWT_SECRET,
  )
}

export function createAuthRouter(config: ServerConfig) {
  const router = Router()
  const requireOrigin = requireFrontendOrigin(config)
  const authenticate = requireSession(config)
  const csrf = requireCsrf(config)

  router.post(
    '/register',
    createRegistrationRateLimiter(),
    requireOrigin,
    async (request, response) => {
      const parsed = registrationSchema.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({
          error: 'Invalid registration details',
          requestId: request.id,
        })
        return
      }

      const registration = parsed.data
      const isNgo = registration.role === 'ngo'
      const email = registration.role === 'ngo' ? registration.officialEmail : registration.email
      const { hash, salt } = await hashPassword(registration.password)
      const profile = isNgo
        ? {
            orgName: registration.orgName,
            contactPerson: registration.contactPerson,
            name: registration.orgName,
            city: registration.operatingCity,
            locality: '',
            address: registration.address,
            regNumber: registration.regNumber ?? '',
            operatingCity: registration.operatingCity,
            areasOfSupport: registration.areasOfSupport ?? [],
            skills: '',
            interests: '',
            availableDays: '',
          }
        : {
            name: registration.fullName,
            city: registration.city,
            locality: registration.locality,
            address: '',
            orgName: '',
            contactPerson: '',
            regNumber: '',
            operatingCity: '',
            areasOfSupport: registration.role === 'volunteer' ? registration.areasOfSupport ?? [] : [],
            skills: registration.role === 'volunteer' ? registration.skills ?? '' : '',
            interests: registration.role === 'volunteer' ? registration.interests ?? '' : '',
            availableDays: registration.role === 'volunteer' ? registration.availableDays ?? '' : '',
          }

      let user: UserDocument
      try {
        user = await User.create({
          email,
          passwordHash: hash,
          salt,
          role: registration.role,
          phone: registration.phone,
          status: statusForRole(registration.role),
          ...profile,
        })
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          response.status(409).json({
            error: 'An account with this email already exists',
            requestId: request.id,
          })
          return
        }
        throw error
      }

      const message =
        registration.role === 'seeker'
          ? 'Account created successfully'
          : registration.role === 'ngo'
            ? 'Organization application received for review'
            : 'Volunteer application received for review'

      response.setHeader('Cache-Control', 'no-store')
      response.status(201).json({ success: true, user: publicUser(user), message })
    },
  )

  router.post(
    '/login',
    createLoginRateLimiter(config),
    requireOrigin,
    async (request, response) => {
      const parsed = loginSchema.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({ error: 'Valid email and password are required', requestId: request.id })
        return
      }

      const { email, password, role } = parsed.data
      const user = await User.findOne({ email }).select('+passwordHash +salt')
      if (!user) {
        await verifyUnknownUserPassword(password)
        response.status(401).json({ error: 'Invalid email or password', requestId: request.id })
        return
      }

      const passwordMatches = await verifyPassword(password, user.passwordHash, user.salt)
      if (!passwordMatches || user.status === 'rejected') {
        response.status(401).json({ error: 'Invalid email or password', requestId: request.id })
        return
      }
      if (role && user.role !== role) {
        response.status(403).json({ error: 'This account does not match the selected role', requestId: request.id })
        return
      }

      const sessionToken = createSessionToken()
      const expiresAt = sessionExpiresAt()
      await Session.create({
        tokenHash: hashSessionToken(sessionToken, config.SESSION_SECRET),
        userId: user._id,
        expiresAt,
      })
      setSessionCookie(response, sessionToken, config)
      response.setHeader('Cache-Control', 'no-store')
      response.json({
        success: true,
        user: publicUser(user),
        csrfToken: createCsrfToken(sessionToken, config.SESSION_SECRET),
        compatibilityToken: compatibilityToken(user, config),
      })
    },
  )

  router.post('/logout', requireOrigin, authenticate, csrf, async (request, response) => {
    await Session.updateOne(
      { _id: request.auth!.sessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    )
    clearSessionCookie(response, config)
    response.setHeader('Cache-Control', 'no-store')
    response.json({ success: true, message: 'Logged out successfully' })
  })

  router.get('/me', authenticate, async (request, response) => {
    const document = await User.findById(request.auth!.user.id)
    if (!document) {
      response.status(401).json({ error: 'Unauthorized', requestId: request.id })
      return
    }

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      user: publicUser(document),
      csrfToken: createCsrfToken(request.auth!.sessionToken, config.SESSION_SECRET),
      compatibilityToken: compatibilityToken(document, config),
    })
  })

  router.put('/me', requireOrigin, authenticate, csrf, async (request, response) => {
    const parsed = profileUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid profile update', requestId: request.id })
      return
    }

    const user = await User.findById(request.auth!.user.id)
    if (!user) {
      response.status(401).json({ error: 'Unauthorized', requestId: request.id })
      return
    }

    user.set(parsed.data)
    await user.save()
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      success: true,
      user: publicUser(user),
      csrfToken: createCsrfToken(request.auth!.sessionToken, config.SESSION_SECRET),
      compatibilityToken: compatibilityToken(user, config),
    })
  })

  return router
}
