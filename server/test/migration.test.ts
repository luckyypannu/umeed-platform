import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { hashPassword } from '../src/auth/crypto.js'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'
import { AuditEvent } from '../src/models/audit-event.js'
import { Notification } from '../src/models/private-features.js'
import { SupportRequest } from '../src/models/support-request.js'
import {
  applyMigrationPlan,
  buildMigrationPlan,
  countTargetDocuments,
  parseLegacySnapshot,
  type LegacySnapshot,
} from '../src/migration/legacy-json.js'
import { Session } from '../src/models/session.js'
import { User } from '../src/models/user.js'
import { VolunteerOpportunity } from '../src/models/volunteer-opportunity.js'
import { createApp } from '../src/app.js'

const frontendOrigin = 'http://localhost:3000'
const sessionSecret = 'phase-six-migration-test-secret-with-at-least-32-bytes'
const jwtSecret = 'phase-six-jwt-test-secret-with-at-least-32-bytes'
const legacyPassword = 'fictional-migration-password'
const fixedDate = '2025-02-03T04:05:06.000Z'
const compatibleSeekerId = '65f000000000000000000001'
const compatibleRequestId = '65f000000000000000000002'

let mongo: MongoMemoryReplSet
let app: ReturnType<typeof createApp>
let passwordHash = ''
let passwordSalt = ''

async function fixtureUser(
  id: string,
  role: 'seeker' | 'volunteer' | 'admin',
  status = role === 'seeker' ? 'active' : role === 'volunteer' ? 'verified' : 'active',
  email = `${id}@example.test`,
) {
  return {
    id,
    email,
    passwordHash,
    salt: passwordSalt,
    role,
    name: `Fictional ${role}`,
    phone: '0000000000',
    city: 'Fictional City',
    locality: 'Fictional locality',
    address: 'Fictional private address',
    skills: 'Fictional skill',
    interests: 'Fictional interest',
    availableDays: 'Fictional days',
    motivation: 'Fictional motivation',
    status,
    createdAt: fixedDate,
  }
}

async function fixtureSnapshot(): Promise<LegacySnapshot> {
  return {
    users: [
      await fixtureUser(compatibleSeekerId, 'seeker'),
      await fixtureUser('legacy-volunteer-beta', 'volunteer'),
      await fixtureUser('usr-seeker-44', 'seeker'),
      await fixtureUser('legacy-admin-gamma', 'admin'),
    ],
    requests: [
      {
        id: compatibleRequestId,
        title: 'Fictional help request',
        category: 'Food Support',
        description: 'Fictional request description',
        city: 'Fictional City',
        locality: 'Private fictional locality',
        urgency: 'medium',
        status: 'submitted',
        seekerId: compatibleSeekerId,
        seekerName: 'Fictional Seeker',
        seekerPhone: '0000000000',
        assignedVolunteerId: 'legacy-volunteer-beta',
        notes: ['Fictional note'],
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
      {
        id: 'legacy-request-demo-dependent',
        title: 'Fictional excluded dependent request',
        category: 'Food Support',
        description: 'Fictional dependent request description',
        city: 'Fictional City',
        urgency: 'low',
        status: 'submitted',
        seekerId: 'usr-seeker-44',
        seekerName: 'Fictional excluded seeker',
        createdAt: fixedDate,
      },
    ],
    opportunities: [
      {
        id: 'legacy-opportunity-alpha',
        title: 'Fictional volunteer task',
        category: 'Food Support',
        mode: 'Remote',
        city: 'Fictional City',
        description: 'Fictional opportunity description',
        status: 'open',
        applicants: [{
          volunteerId: 'legacy-volunteer-beta',
          status: 'applied',
          appliedAt: fixedDate,
        }],
        createdAt: fixedDate,
      },
    ],
    emergencyAlerts: [{
      id: 'fictional-emergency-unowned',
      latitude: 10,
      longitude: 70,
      accuracy: 10,
      status: 'resolved',
      createdAt: fixedDate,
    }],
    chatMessages: [{
      id: 'fictional-shared-message',
      sessionId: 'default',
      sender: 'user',
      text: 'Fictional unowned chat',
      timestamp: fixedDate,
    }],
    notifications: [
      {
        id: 'legacy-notification-alpha',
        userId: compatibleSeekerId,
        message: 'Fictional private message containing request details',
        type: 'info',
        link: '/dashboard',
        read: false,
        createdAt: fixedDate,
      },
      {
        id: 'legacy-notification-demo-dependent',
        userId: 'usr-seeker-44',
        message: 'Fictional excluded notification',
        type: 'success',
        read: true,
        createdAt: fixedDate,
      },
    ],
  }
}

before(async () => {
  const credentials = await hashPassword(legacyPassword)
  passwordHash = credentials.hash
  passwordSalt = credentials.salt
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: '7.0.14' },
  })
  const config = parseEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'umeed_migration_test',
    SESSION_SECRET: sessionSecret,
    JWT_SECRET: jwtSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    LOG_LEVEL: 'silent',
  })
  await connectDatabase(config)
  await Promise.all([
    AuditEvent.createIndexes(),
    Notification.createIndexes(),
    Session.createIndexes(),
    SupportRequest.createIndexes(),
    User.createIndexes(),
    VolunteerOpportunity.createIndexes(),
  ])
  app = createApp(config)
})

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  }
  await mongo?.stop()
})

test('dry-run validates and aggregates without writing records or exposing source values', async () => {
  const snapshot = await fixtureSnapshot()
  const beforeCounts = await countTargetDocuments()
  const plan = buildMigrationPlan(parseLegacySnapshot(snapshot))
  const afterCounts = await countTargetDocuments()

  assert.deepEqual(afterCounts, beforeCounts)
  assert.deepEqual(plan.sourceCounts, {
    users: 4,
    requests: 2,
    opportunities: 1,
    emergencyAlerts: 1,
    chatMessages: 1,
    notifications: 2,
  })
  assert.deepEqual(plan.importCounts, {
    users: 2,
    requests: 1,
    opportunities: 1,
    notifications: 1,
  })
  assert.equal(plan.blockingIssueCount, 0)
  assert.equal(plan.rejectedByCategory.seed_accounts_pending_review, 1)
  assert.equal(plan.rejectedByCategory.admin_accounts_excluded, 1)
  assert.equal(plan.rejectedByCategory.dependent_records_excluded, 2)
  assert.equal(plan.rejectedByCategory.emergency_records_unowned_or_unconsented, 1)
  assert.equal(plan.rejectedByCategory.chat_messages_unowned_or_shared, 1)
  const serializedReport = JSON.stringify({
    sourceCounts: plan.sourceCounts,
    importCounts: plan.importCounts,
    rejectedByCategory: plan.rejectedByCategory,
    sourceSha256: plan.sourceSha256,
  })
  for (const sensitiveValue of [passwordHash, passwordSalt, legacyPassword, '0000000000', 'Fictional Seeker']) {
    assert.equal(serializedReport.includes(sensitiveValue), false)
  }
})

test('apply preserves IDs and relationships, sanitizes notification text, and reruns idempotently', async () => {
  const plan = buildMigrationPlan(await fixtureSnapshot())
  const first = await applyMigrationPlan(plan)
  assert.deepEqual(first.inserted, {
    users: 2,
    requests: 1,
    opportunities: 1,
    notifications: 1,
  })

  const seeker = await User.findOne({ legacyId: compatibleSeekerId })
  const volunteer = await User.findOne({ legacyId: 'legacy-volunteer-beta' })
  const supportRequest = await SupportRequest.findOne({ legacyId: compatibleRequestId })
  const opportunity = await VolunteerOpportunity.findOne({ legacyId: 'legacy-opportunity-alpha' })
  const notification = await Notification.findOne({ legacyId: 'legacy-notification-alpha' })

  assert.ok(seeker)
  assert.ok(volunteer)
  assert.ok(supportRequest)
  assert.equal(supportRequest._id.toString(), compatibleRequestId)
  assert.ok(opportunity)
  assert.ok(notification)
  assert.equal(seeker.role, 'seeker')
  assert.equal(seeker._id.toString(), compatibleSeekerId)
  assert.equal(volunteer.role, 'volunteer')
  assert.equal(supportRequest.seekerId.toString(), seeker._id.toString())
  assert.equal(supportRequest.assignedVolunteerId?.toString(), volunteer._id.toString())
  assert.equal(opportunity.applicants[0].volunteerId.toString(), volunteer._id.toString())
  assert.equal(notification.recipientId.toString(), seeker._id.toString())
  assert.equal(notification.message, 'You have a previous update from UMEED.')
  assert.equal(await User.countDocuments({ role: 'admin' }), 0)
  assert.equal(await User.countDocuments({ legacyId: 'usr-seeker-44' }), 0)

  const second = await applyMigrationPlan(plan)
  assert.deepEqual(second.inserted, {
    users: 0,
    requests: 0,
    opportunities: 0,
    notifications: 0,
  })
  assert.deepEqual(second.unchanged, {
    users: 2,
    requests: 1,
    opportunities: 1,
    notifications: 1,
  })
  assert.equal(await User.countDocuments({ legacyId: { $exists: true } }), 2)
})

test('legacy scrypt hashes authenticate through the current password login endpoint', async () => {
  const plan = buildMigrationPlan(await fixtureSnapshot())
  await applyMigrationPlan(plan)
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', frontendOrigin)
    .send({
      email: `${compatibleSeekerId}@example.test`,
      password: legacyPassword,
      role: 'seeker',
    })
  assert.equal(response.status, 200)
  assert.equal(response.body.user.role, 'seeker')
  assert.equal(response.body.user.email, `${compatibleSeekerId}@example.test`)
  assert.match(response.headers['set-cookie'][0], /^umeed_session=/)
})

test('invalid statuses, hashes, duplicate emails, and dangling references block import', async () => {
  const snapshot = await fixtureSnapshot()
  const invalidUser = await fixtureUser('legacy-invalid-user', 'seeker', 'unknown-status')
  invalidUser.passwordHash = 'not-a-compatible-hash'
  snapshot.users.push(invalidUser)
  const invalidHashUser = await fixtureUser('legacy-invalid-hash-user', 'seeker')
  invalidHashUser.passwordHash = 'not-a-compatible-hash'
  snapshot.users.push(invalidHashUser)
  snapshot.users.push(await fixtureUser(
    'legacy-duplicate-user',
    'seeker',
    'active',
    `${compatibleSeekerId}@EXAMPLE.TEST`,
  ))
  snapshot.requests.push({
    id: 'legacy-request-dangling',
    title: 'Fictional request',
    category: 'Food Support',
    description: 'Fictional description',
    city: 'Fictional City',
    urgency: 'medium',
    status: 'submitted',
    seekerId: 'missing-fictional-user',
    seekerName: 'Fictional Seeker',
    createdAt: fixedDate,
  })

  const plan = buildMigrationPlan(parseLegacySnapshot(snapshot))
  assert.ok(plan.blockingIssueCount > 0)
  assert.ok(plan.rejectedByCategory.invalid_statuses > 0)
  assert.ok(plan.rejectedByCategory.incompatible_password_hashes > 0)
  assert.ok(plan.rejectedByCategory.duplicate_email_users > 0)
  assert.ok(plan.rejectedByCategory.invalid_references > 0)
  const before = await countTargetDocuments()
  await assert.rejects(applyMigrationPlan(plan), /blocking validation issues/)
  assert.deepEqual(await countTargetDocuments(), before)

  assert.throws(() => parseLegacySnapshot({ users: [] }), /Migration input is invalid/)
})

test('conflicts abort the transaction without partial inserts or overwriting target data', async () => {
  const sourceIds = [
    compatibleSeekerId,
    'legacy-volunteer-beta',
    'usr-seeker-44',
    'legacy-admin-gamma',
  ]
  await Promise.all([
    User.deleteMany({ legacyId: { $in: sourceIds } }),
    SupportRequest.deleteMany({ legacyId: { $in: [compatibleRequestId, 'legacy-request-demo-dependent'] } }),
    VolunteerOpportunity.deleteMany({ legacyId: 'legacy-opportunity-alpha' }),
    Notification.deleteMany({ legacyId: { $in: ['legacy-notification-alpha', 'legacy-notification-demo-dependent'] } }),
  ])
  const snapshot = await fixtureSnapshot()
  const plan = buildMigrationPlan(snapshot)
  await User.create({
    email: 'legacy-volunteer-beta@example.test',
    passwordHash,
    salt: passwordSalt,
    role: 'volunteer',
    name: 'Fictional unrelated existing target user',
    phone: '0000000000',
    city: 'Fictional City',
    status: 'verified',
  })
  const before = await countTargetDocuments()

  await assert.rejects(
    applyMigrationPlan(plan),
    /Migration transaction aborted; no records were committed/,
  )

  assert.deepEqual(await countTargetDocuments(), before)
  assert.equal(await User.findOne({ legacyId: compatibleSeekerId }), null)
  const preserved = await User.findOne({ email: 'legacy-volunteer-beta@example.test' })
  assert.equal(preserved?.name, 'Fictional unrelated existing target user')
})
