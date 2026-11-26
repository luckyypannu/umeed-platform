import { randomUUID } from 'node:crypto'
import express, { type ErrorRequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import helmet from 'helmet'
import pino from 'pino'
import { pinoHttp } from 'pino-http'
import { allowedFrontendOrigins, type ServerConfig } from './config/env.js'
import { isDatabaseReady } from './database/connection.js'
import { createAuthRouter } from './auth/routes.js'
import { createRequestRouter, createVerificationRouter } from './requests/routes.js'
import { createPrivateFeatureRouter } from './private-features/routes.js'
import { createOpportunityRouter } from './opportunities/routes.js'
import { createDirectoryRouter } from './directory/routes.js'
import { createImpactRouter } from './impact/routes.js'
import { createAnalyticsRouter } from './analytics/routes.js'



export function createApp(config: ServerConfig) {
  const app = express()
  const logger = pino({ level: config.LOG_LEVEL })
  const frontendOrigins = new Set(allowedFrontendOrigins(config))

  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUST_PROXY)
  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, origin !== undefined && frontendOrigins.has(origin))
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  )
  app.use(
    pinoHttp({
      logger,
      genReqId(_req, res) {
        const requestId = randomUUID()
        res.setHeader('X-Request-Id', requestId)
        return requestId
      },
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: typeof req.url === 'string' ? req.url.split('?')[0] : undefined,
          }
        },
        res(res) {
          return { statusCode: res.statusCode }
        },
      },
    }),
  )
  app.use(express.json({ limit: '32kb' }))
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.API_RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    }),
  )

  app.get('/api/v1/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.get('/api/v1/health/ready', (_req, res) => {
    if (!isDatabaseReady()) {
      res.status(503).json({ status: 'not_ready', checks: { database: 'not_ready' } })
      return
    }
    res.status(200).json({ status: 'ready', checks: { database: 'ready' } })
  })

  app.use('/api/v1/auth', createAuthRouter(config))
  app.use('/api/v1/requests', createRequestRouter(config))
  app.use('/api/v1', createVerificationRouter(config))
  app.use('/api/v1', createPrivateFeatureRouter(config))
  app.use('/api/v1', createOpportunityRouter(config))
  app.use('/api/v1', createDirectoryRouter(config))
  app.use('/api/v1', createImpactRouter())
  app.use('/api/v1/analytics', createAnalyticsRouter(config))

  app.use('/api/v1', (req, res) => {
    res.status(404).json({ error: 'Not found', requestId: req.id })
  })
  // error handling

  const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number' &&
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500
    const requestId = req.id

    if (statusCode >= 500) {
      req.log.error({ requestId, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed')
    }

    res.status(statusCode).json({
      error: statusCode >= 500 ? 'Internal server error' : 'Invalid request',
      requestId,
    })
  }
  app.use(errorHandler)

  return app
}
