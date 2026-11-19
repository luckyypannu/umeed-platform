import pino from 'pino'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'
import { Session } from '../src/models/session.js'
import { AuditEvent } from '../src/models/audit-event.js'
import { SupportRequest } from '../src/models/support-request.js'
import { User } from '../src/models/user.js'
import { VolunteerOpportunity } from '../src/models/volunteer-opportunity.js'
import { ChatSession, EmergencyRecord, Notification } from '../src/models/private-features.js'

async function main(): Promise<void> {
  const config = parseEnvironment(process.env)
  const logger = pino({ level: config.LOG_LEVEL })
  await connectDatabase(config)
  try {
    await User.createIndexes()
    await Session.createIndexes()
    await SupportRequest.createIndexes()
    await AuditEvent.createIndexes()
    await EmergencyRecord.createIndexes()
    await ChatSession.createIndexes()
    await Notification.createIndexes()
    await VolunteerOpportunity.createIndexes()
    logger.info('Application indexes created')
  } finally {
    await disconnectDatabase()
  }
}

void main().catch((error: unknown) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
  logger.error(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    'Index creation failed',
  )
  process.exitCode = 1
})
