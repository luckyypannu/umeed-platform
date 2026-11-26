import { createHmac } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { allowedFrontendOrigins, type ServerConfig } from '../config/env.js'
import { Session } from '../models/session.js'
import { User } from '../models/user.js'
import type { UserRole } from '../models/user.js'
import { hashSessionToken, sessionMaxAgeSeconds, verifyCsrfToken } from './crypto.js'

export const SESSION_COOKIE_NAME = 'umeed_session'

function readSessionCookie(request: Request): string | null {
  const cookies = request.headers.cookie?.split(';') ?? []
  const matching = cookies.filter((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
  if (matching.length !== 1) return null

  const value = matching[0].trim().slice(SESSION_COOKIE_NAME.length + 1)
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null
}

function hasSessionCookie(request: Request): boolean {
  return (request.headers.cookie?.split(';') ?? []).some((part) =>
    part.trim().startsWith(`${SESSION_COOKIE_NAME}=`),
  )
}

export function setSessionCookie(response: Response, token: string, config: ServerConfig): void {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds()}${secure}`,
  )
}

export function clearSessionCookie(response: Response, config: ServerConfig): void {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  )
}

export function requireFrontendOrigin(config: ServerConfig) {
  const allowedOrigins = new Set(allowedFrontendOrigins(config))
  return (request: Request, response: Response, next: NextFunction) => {
    if (!allowedOrigins.has(request.get('origin') ?? '')) {
      response.status(403).json({ error: 'Request origin is not allowed', requestId: request.id })
      return
    }
    next()
  }
}

async function authenticateSession(request: Request, config: ServerConfig): Promise<boolean> {
  const token = readSessionCookie(request)
  if (!token) return false
    const now = new Date()
    const session = await Session.findOne({
      tokenHash: hashSessionToken(token, config.SESSION_SECRET),
      revokedAt: null,
      expiresAt: { $gt: now },
    }).lean()
    if (!session) return false

    const user = await User.findById(session.userId)
    if (!user || user.status === 'rejected') {
      await Session.updateOne(
        { _id: session._id, revokedAt: null },
        { $set: { revokedAt: now } },
      )
      return false
    }

    request.auth = {
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        status: user.status,
      },
      sessionId: session._id.toString(),
      sessionToken: token,
    }
  return true
}

export function requireSession(config: ServerConfig) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!(await authenticateSession(request, config))) {
      response.status(401).json({ error: 'Unauthorized', requestId: request.id })
      return
    }
    next()
  }
}

export function optionalSession(config: ServerConfig) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!hasSessionCookie(request)) {
      next()
      return
    }
    if (!(await authenticateSession(request, config))) {
      response.status(401).json({ error: 'Unauthorized', requestId: request.id })
      return
    }
    next()
  }
}

export function requireCsrf(config: ServerConfig) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (
      !verifyCsrfToken(
        request.get('x-csrf-token'),
        request.auth?.sessionToken ?? '',
        config.SESSION_SECRET,
      )
    ) {
      response.status(403).json({ error: 'Invalid CSRF token', requestId: request.id })
      return
    }
    next()
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      response.status(401).json({ error: 'Unauthorized', requestId: request.id })
      return
    }
    if (!roles.includes(request.auth.user.role)) {
      response.status(403).json({ error: 'Forbidden', requestId: request.id })
      return
    }
    next()
  }
}

export function createLoginRateLimiter(config: ServerConfig) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator(request) {
      const ip = request.ip ? ipKeyGenerator(request.ip) : 'unknown'
      if (typeof request.body?.email === 'string') {
        const email = request.body.email.trim().toLowerCase()
        const emailHash = createHmac('sha256', config.SESSION_SECRET).update(email).digest('hex')
        return `email:${emailHash}:ip:${ip}`
      }
      return `ip:${ip}`
    },
    message: { error: 'Too many login attempts. Please try again later.' },
  })
}

export const createLoginIpRateLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator(request) {
      return request.ip ? `ip:${ipKeyGenerator(request.ip)}` : 'ip:unknown'
    },
    message: { error: 'Too many login attempts. Please try again later.' },
  })

export const createRegistrationRateLimiter = () =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many registration attempts. Please try again later.' },
  })
