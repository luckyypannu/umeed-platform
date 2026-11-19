import { createServer } from 'node:http'
import pino from 'pino'
import { createApp } from './app.js'
import { parseEnvironment } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './database/connection.js'


async function start(): Promise<void> {
  const config = parseEnvironment(process.env)
  const logger = pino({ level: config.LOG_LEVEL })
  await connectDatabase(config)

  const server = createServer(createApp(config))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.PORT, resolve)
  })

  logger.info({ port: config.PORT }, 'UMEED API server started')

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'UMEED API server shutting down')
    server.close((error) => {
      if (error) {
        logger.error({ errorName: error.name }, 'HTTP server shutdown failed')
        process.exitCode = 1
      }
      void disconnectDatabase().catch(() => {
        logger.error('MongoDB disconnect failed')
        process.exitCode = 1
      })
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

void start().catch((error: unknown) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
  logger.error(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    'UMEED API startup failed; check configuration and MongoDB availability',
  )
  process.exitCode = 1
})
