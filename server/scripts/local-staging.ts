import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { AuditEvent } from '../src/models/audit-event.js'
import {
  ChatSession,
  EmergencyRecord,
  Notification,
} from '../src/models/private-features.js'
import { Session } from '../src/models/session.js'
import { SupportRequest } from '../src/models/support-request.js'
import { User } from '../src/models/user.js'
import { VolunteerOpportunity } from '../src/models/volunteer-opportunity.js'
import { hashPassword } from '../src/auth/crypto.js'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const serverDirectory = resolve(scriptDirectory, '..')
const projectDirectory = resolve(serverDirectory, '..')
const dataDirectory = resolve(serverDirectory, '.local-staging-data')
const mongoDirectory = resolve(dataDirectory, 'member')
const stagingMarker = resolve(dataDirectory, '.umeed-phase71-staging')
const dbName = 'umeed_phase71_staging'
const fixturePassword = 'Umeed-Staging-Only-53!'
const frontendOrigin = 'http://localhost:3100'
const additionalFrontendOrigins = 'http://127.0.0.1:3100'
const apiPort = 4100
const mongoPort = 27117
const sessionSecret = randomBytes(32).toString('hex')
const fixtureUsers = [
  { email: 'admin@phase71.example.test', role: 'admin', status: 'active', name: 'Fictional UMEED Admin' },
  { email: 'seeker@phase71.example.test', role: 'seeker', status: 'active', name: 'Fictional Aditi Sharma' },
  { email: 'ngo@phase71.example.test', role: 'ngo', status: 'verified', name: 'Fictional Helping Hands Foundation' },
  { email: 'volunteer@phase71.example.test', role: 'volunteer', status: 'verified', name: 'Fictional Arjun Mehta' },
  { email: 'pending-ngo@phase71.example.test', role: 'ngo', status: 'pending_verification', name: 'Fictional Umeed Seva Trust' },
  { email: 'pending-volunteer@phase71.example.test', role: 'volunteer', status: 'pending_review', name: 'Fictional Simran Kaur' },
] as const

const children: ChildProcess[] = []
let mongo: MongoMemoryReplSet | undefined
let shuttingDown = false

async function seedFictionalStagingData(mongoUri: string): Promise<void> {
  const config = parseEnvironment({
    NODE_ENV: 'development',
    MONGODB_URI: mongoUri,
    MONGODB_DB_NAME: dbName,
    SESSION_SECRET: sessionSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    LOCAL_STAGING_ORIGINS: additionalFrontendOrigins,
    PORT: String(apiPort),
    LOG_LEVEL: 'silent',
  })
  await connectDatabase(config)
  try {
    await Promise.all([
      AuditEvent.createIndexes(),
      ChatSession.createIndexes(),
      EmergencyRecord.createIndexes(),
      Notification.createIndexes(),
      Session.createIndexes(),
      SupportRequest.createIndexes(),
      User.createIndexes(),
      VolunteerOpportunity.createIndexes(),
    ])

    const { hash, salt } = await hashPassword(fixturePassword)
    for (const fixture of fixtureUsers) {
      if (await User.exists({ email: fixture.email })) continue
      await User.create({
        ...fixture,
        passwordHash: hash,
        salt,
        phone: '0000000000',
        city: 'Fictional City',
        locality: 'Fictional District',
        orgName: fixture.role === 'ngo' ? fixture.name : '',
        operatingCity: fixture.role === 'ngo' ? 'Fictional City' : '',
        contactPerson: 'Fictional Contact',
        address: 'Fictional staging address',
        regNumber: 'STAGING-ONLY',
        areasOfSupport: ['Food Support', 'Education'],
        skills: 'Fictional tutoring skill',
        interests: 'Fictional community activity',
        availableDays: 'Weekends',
      })
    }

    const [seeker, ngo, volunteer] = await Promise.all([
      User.findOne({ email: 'seeker@phase71.example.test' }).select('_id name'),
      User.findOne({ email: 'ngo@phase71.example.test' }).select('_id'),
      User.findOne({ email: 'volunteer@phase71.example.test' }).select('_id'),
    ])
    if (!seeker || !ngo || !volunteer) throw new Error('Fictional staging fixtures are incomplete')
    const requestFixtures = [
      {
        title: 'Fictional family food assistance',
        category: 'Food Support',
        description: 'A fictional family is requesting temporary grocery support while a caregiver is between jobs.',
        status: 'submitted' as const,
        urgency: 'high' as const,
        assignedNgoId: null,
        assignedVolunteerId: null,
      },
      {
        title: 'Fictional student education support',
        category: 'Education',
        description: 'A fictional student needs learning materials and weekly remote tutoring support.',
        status: 'in_progress' as const,
        urgency: 'medium' as const,
        assignedNgoId: ngo._id,
        assignedVolunteerId: volunteer._id,
      },
      {
        title: 'Fictional elderly neighbor assistance',
        category: 'Elderly Support',
        description: 'A fictional older adult is seeking help arranging regular community check-ins.',
        status: 'resolved' as const,
        urgency: 'low' as const,
        assignedNgoId: ngo._id,
        assignedVolunteerId: volunteer._id,
      },
    ]
    for (const fixture of requestFixtures) {
      if (await SupportRequest.exists({ title: fixture.title })) continue
      await SupportRequest.create({
        ...fixture,
        city: 'Fictional City',
        locality: 'Fictional District',
        seekerId: seeker._id,
        seekerName: seeker.name,
        seekerPhone: '0000000000',
        notes: ['Fictional local demonstration fixture.'],
      })
    }

    const opportunityTitle = 'Fictional community cleanliness drive'
    if (!(await VolunteerOpportunity.exists({ title: opportunityTitle }))) {
      await VolunteerOpportunity.create({
        createdById: ngo._id,
        title: opportunityTitle,
        category: 'Community Support',
        mode: 'In-person',
        city: 'Fictional City',
        description: 'A fictional neighborhood initiative to organize a community cleanup and share public health information.',
        status: 'open',
        applicants: [{ volunteerId: volunteer._id, status: 'applied', appliedAt: new Date() }],
      })
    }
    if (!(await Notification.exists({ recipientId: seeker._id, message: 'Fictional Phase 7.1 staging notification.' }))) {
      await Notification.create({
        recipientId: seeker._id,
        message: 'Fictional Phase 7.1 staging notification.',
        type: 'info',
        link: '/dashboard?tab=my-requests',
        read: false,
      })
    }
    const stagedNotifications = [
      {
        recipientId: ngo._id,
        message: 'Fictional staging: a matching community support request is ready for review.',
        type: 'info' as const,
        link: '/dashboard?role=ngo&tab=ngo-requests',
      },
      {
        recipientId: volunteer._id,
        message: 'Fictional staging: a community opportunity is available to review.',
        type: 'info' as const,
        link: '/dashboard?role=volunteer&tab=volunteer-opportunities',
      },
    ]
    for (const notification of stagedNotifications) {
      if (await Notification.exists({ recipientId: notification.recipientId, message: notification.message })) {
        continue
      }
      await Notification.create({ ...notification, read: false })
    }
  } finally {
    await disconnectDatabase()
  }
}

function startChild(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, {
    cwd: projectDirectory,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
  })
  child.once('error', (error) => {
    console.error(`Staging child process failed: ${error.name}`)
    void shutdown(1)
  })
  child.once('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Staging child process exited unexpectedly with code ${code ?? 'unknown'}`)
      void shutdown(code ?? 1)
    }
  })
  children.push(child)
  return child
}

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
  await Promise.all(children.map((child) => new Promise<void>((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit()
      return
    }
    child.once('exit', () => resolveExit())
    setTimeout(() => resolveExit(), 5000).unref()
  })))
  if (mongo) await mongo.stop({ doCleanup: false })
  process.exitCode = exitCode
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The local staging harness cannot run in production mode')
  }
  const existingDataDirectoryEntries = existsSync(dataDirectory)
    ? readdirSync(dataDirectory)
    : []
  if (existingDataDirectoryEntries.length > 0 && !existsSync(stagingMarker)) {
    throw new Error('Local staging data already exists; inspect it and move it aside before reinitializing')
  }
  mkdirSync(dataDirectory, { recursive: true })
  mkdirSync(mongoDirectory, { recursive: true })

  mongo = await MongoMemoryReplSet.create({
    binary: { version: '7.0.14' },
    replSet: { count: 1, storageEngine: 'wiredTiger', name: 'umeedPhase71Stage' },
    instanceOpts: [{
      dbPath: mongoDirectory,
      port: mongoPort,
    }],
  })
  if (!existsSync(stagingMarker)) {
    writeFileSync(stagingMarker, 'Fictional UMEED local staging database\n', { flag: 'wx' })
  }
  const mongoUri = mongo.getUri(dbName)
  await seedFictionalStagingData(mongoUri)

  startChild(process.execPath, [resolve(serverDirectory, 'dist', 'src', 'index.js')], {
    NODE_ENV: 'development',
    MONGODB_URI: mongoUri,
    MONGODB_DB_NAME: dbName,
    SESSION_SECRET: sessionSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    LOCAL_STAGING_ORIGINS: additionalFrontendOrigins,
    PORT: String(apiPort),
    LOG_LEVEL: 'silent',
    API_RATE_LIMIT_MAX: '300',
    TRUST_PROXY: '0',
  })
  startChild(process.execPath, [
    resolve(projectDirectory, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3100',
  ], {
    NODE_ENV: 'development',
    API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  })

  console.log(`Fictional disk-backed staging is ready at ${frontendOrigin}`)
  console.log('Admin: admin@phase71.example.test')
  console.log('Seeker: seeker@phase71.example.test')
  console.log('Verified NGO: ngo@phase71.example.test')
  console.log('Verified volunteer: volunteer@phase71.example.test')
  console.log('Pending NGO: pending-ngo@phase71.example.test')
  console.log('Pending volunteer: pending-volunteer@phase71.example.test')
  console.log(`Fictional staging password: ${fixturePassword}`)
  console.log('Press Ctrl+C to stop the services. MongoDB files remain in server/.local-staging-data.')
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
void main().catch(async (error: unknown) => {
  console.error(`Local staging startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  await shutdown(1)
})
