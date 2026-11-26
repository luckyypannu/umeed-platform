import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { after, before, test } from 'node:test'
import request from 'supertest'
import {
  createCsrfToken,
  createSessionToken,
  hashPassword,
  hashSessionToken,
} from '../src/auth/crypto.js'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'
import { AuditEvent } from '../src/models/audit-event.js'
import { Notification } from '../src/models/private-features.js'
import { Session } from '../src/models/session.js'
import { User, type UserRole, type UserStatus } from '../src/models/user.js'
import { VolunteerOpportunity } from '../src/models/volunteer-opportunity.js'
import { SupportRequest } from '../src/models/support-request.js'
import { createApp } from '../src/app.js'

const frontendOrigin = 'http://localhost:3000'
const sessionSecret = 'phase-seven-directory-test-secret-with-at-least-32-bytes'
let mongo: MongoMemoryReplSet
let app: ReturnType<typeof createApp>
const userIds: Record<string, string> = {}
const cookies: Record<string, string> = {}
const csrfTokens: Record<string, string> = {}

async function createFixtureUser(key: string, role: UserRole, status: UserStatus) {
  const { hash, salt } = await hashPassword(`fictional-${key}-password`)
  const user = await User.create({
    email: `${key}@example.test`,
    passwordHash: hash,
    salt,
    role,
    name: `Fictional ${key}`,
    orgName: role === 'ngo' ? `Fictional ${key} organization` : '',
    contactPerson: 'Fictional contact',
    regNumber: 'FICTIONAL-001',
    address: 'Fictional private address',
    phone: '0000000000',
    city: 'Fictional City',
    operatingCity: 'Fictional City',
    skills: 'Fictional skill',
    interests: 'Fictional interest',
    availableDays: 'Fictional weekdays',
    areasOfSupport: ['Food Support'],
    status,
  })
  userIds[key] = user._id.toString()

  const token = createSessionToken()
  await Session.create({
    tokenHash: hashSessionToken(token, sessionSecret),
    userId: user._id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  cookies[key] = `umeed_session=${token}`
  csrfTokens[key] = createCsrfToken(token, sessionSecret)
  return user
}

function agent(key: string) {
  return request.agent(app).set('Cookie', cookies[key])
}

function mutation(key: string) {
  return agent(key).set('Origin', frontendOrigin).set('X-CSRF-Token', csrfTokens[key])
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: '7.0.14' },
  })
  const config = parseEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'umeed_phase_seven_directory_test',
    SESSION_SECRET: sessionSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    LOG_LEVEL: 'silent',
  })
  await connectDatabase(config)
  await Promise.all([
    AuditEvent.createIndexes(),
    Notification.createIndexes(),
    Session.createIndexes(),
    User.createIndexes(),
    VolunteerOpportunity.createIndexes(),
    SupportRequest.createIndexes(),
  ])
  app = createApp(config)

  await createFixtureUser('verified-ngo', 'ngo', 'verified')
  await createFixtureUser('pending-ngo', 'ngo', 'pending_verification')
  await createFixtureUser('verified-volunteer', 'volunteer', 'verified')
  await createFixtureUser('pending-volunteer', 'volunteer', 'pending_review')
  await createFixtureUser('seeker', 'seeker', 'active')
  await createFixtureUser('admin', 'admin', 'active')

  await VolunteerOpportunity.create({
    createdById: userIds['verified-ngo'],
    title: 'Fictional community activity',
    category: 'Food Support',
    mode: 'In-person',
    city: 'Fictional City',
    description: 'Fictional opportunity for isolated tests.',
    status: 'open',
    applicants: [],
  })
})

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  }
  await mongo?.stop()
})

test('public NGO directory only returns verified NGO fields; all applicants require Admin', async () => {
  const publicResponse = await request(app).get('/api/v1/ngos')
  assert.equal(publicResponse.status, 200)
  assert.equal(publicResponse.body.ngos.length, 1)
  assert.equal(publicResponse.body.ngos[0].status, undefined)
  assert.equal(publicResponse.body.ngos[0].email, undefined)
  assert.equal(publicResponse.body.ngos[0].address, undefined)

  const seekerDenied = await agent('seeker').get('/api/v1/ngos?all=true')
  assert.equal(seekerDenied.status, 403)
  const anonymousDenied = await request(app).get('/api/v1/ngos?all=true')
  assert.equal(anonymousDenied.status, 401)

  const adminView = await agent('admin').get('/api/v1/ngos?all=true')
  assert.equal(adminView.status, 200)
  assert.equal(adminView.body.ngos.length, 1)
  assert.ok(adminView.body.ngos.every((ngo: { status: string }) => ngo.status === 'pending_verification'))
  assert.equal(await AuditEvent.countDocuments({ action: 'verification.queue.accessed', targetId: 'ngos' }), 1)
})

test('public volunteer directory excludes pending private profiles and Admin queue access is audited', async () => {
  const publicResponse = await request(app).get('/api/v1/volunteers')
  assert.equal(publicResponse.status, 200)
  assert.equal(publicResponse.body.volunteers.length, 1)
  assert.equal(publicResponse.body.volunteers[0].email, undefined)
  assert.equal(publicResponse.body.volunteers[0].phone, undefined)

  const seekerDenied = await agent('seeker').get('/api/v1/volunteers?all=true')
  assert.equal(seekerDenied.status, 403)
  const adminView = await agent('admin').get('/api/v1/volunteers?all=true')
  assert.equal(adminView.status, 200)
  assert.equal(adminView.body.volunteers.length, 1)
  assert.ok(adminView.body.volunteers.every((volunteer: { status: string }) => volunteer.status === 'pending_review'))
  assert.equal(await AuditEvent.countDocuments({ action: 'verification.queue.accessed', targetId: 'volunteers' }), 1)
})

test('opportunity applications require a verified volunteer and never expose applicant identifiers', async () => {
  const opportunity = await VolunteerOpportunity.findOne({ status: 'open' })
  assert.ok(opportunity)

  const publicList = await request(app).get('/api/v1/opportunities')
  assert.equal(publicList.status, 200)
  assert.equal(publicList.body.opportunities.length, 1)
  assert.equal(publicList.body.opportunities[0].applicantCount, 0)
  assert.equal('applicants' in publicList.body.opportunities[0], false)

  const deniedSeeker = await mutation('seeker')
    .post('/api/v1/opportunities')
    .send({ opportunityId: opportunity._id.toString() })
  assert.equal(deniedSeeker.status, 403)
  const deniedPendingVolunteer = await mutation('pending-volunteer')
    .post('/api/v1/opportunities')
    .send({ opportunityId: opportunity._id.toString() })
  assert.equal(deniedPendingVolunteer.status, 403)

  const application = await mutation('verified-volunteer')
    .post('/api/v1/opportunities')
    .send({ opportunityId: opportunity._id.toString() })
  assert.equal(application.status, 201)
  assert.equal(application.body.opportunity.hasApplied, true)
  assert.equal(application.body.opportunity.applicantCount, 1)
  assert.equal(JSON.stringify(application.body).includes(userIds['verified-volunteer']), false)

  const duplicate = await mutation('verified-volunteer')
    .post('/api/v1/opportunities')
    .send({ opportunityId: opportunity._id.toString() })
  assert.equal(duplicate.status, 409)

  const unauthorizedApplications = await agent('seeker')
    .get(`/api/v1/opportunities/${opportunity._id.toString()}/applicants`)
  assert.equal(unauthorizedApplications.status, 403)

  const applicantList = await agent('verified-ngo')
    .get(`/api/v1/opportunities/${opportunity._id.toString()}/applicants`)
  assert.equal(applicantList.status, 200)
  assert.equal(applicantList.body.applicants.length, 1)
  assert.equal(applicantList.body.applicants[0].name, 'Fictional verified-volunteer')
  assert.equal('email' in applicantList.body.applicants[0], false)

  await createFixtureUser('other-verified-ngo', 'ngo', 'verified')
  const crossNgoApplications = await agent('other-verified-ngo')
    .get(`/api/v1/opportunities/${opportunity._id.toString()}/applicants`)
  assert.equal(crossNgoApplications.status, 404)

  const accept = await mutation('verified-ngo')
    .patch(`/api/v1/opportunities/${opportunity._id.toString()}/applicants`)
    .send({ volunteerId: userIds['verified-volunteer'], status: 'accepted' })
  assert.equal(accept.status, 200)
  assert.equal(accept.body.status, 'accepted')
  assert.equal(
    await Notification.countDocuments({
      recipientId: userIds['verified-volunteer'],
      message: /application.*accepted/i,
    }),
    1,
  )
  assert.equal(await AuditEvent.countDocuments({
    action: 'opportunity.application.accepted',
    targetId: opportunity._id.toString(),
  }), 1)
})

test('only verified NGOs can publish validated opportunities and creation is audited', async () => {
  const opportunityInput = {
    title: 'Fictional tutoring sessions',
    category: 'Education',
    mode: 'Remote',
    city: 'Fictional City',
    description: 'Provide fictional remote tutoring support.',
  }
  const anonymous = await request(app)
    .post('/api/v1/opportunities/create')
    .set('Origin', frontendOrigin)
    .send(opportunityInput)
  assert.equal(anonymous.status, 401)

  const seekerDenied = await mutation('seeker')
    .post('/api/v1/opportunities/create')
    .send(opportunityInput)
  assert.equal(seekerDenied.status, 403)

  const pendingNgoDenied = await mutation('pending-ngo')
    .post('/api/v1/opportunities/create')
    .send(opportunityInput)
  assert.equal(pendingNgoDenied.status, 403)

  const invalid = await mutation('verified-ngo')
    .post('/api/v1/opportunities/create')
    .send({ ...opportunityInput, mode: 'Hybrid', status: 'completed' })
  assert.equal(invalid.status, 400)

  const created = await mutation('verified-ngo')
    .post('/api/v1/opportunities/create')
    .send(opportunityInput)
  assert.equal(created.status, 201)
  assert.equal(created.body.opportunity.title, opportunityInput.title)
  assert.equal(created.body.opportunity.applicantCount, 0)
  assert.equal('createdById' in created.body.opportunity, false)

  const stored = await VolunteerOpportunity.findById(created.body.opportunity.id).lean()
  assert.equal(stored?.createdById?.toString(), userIds['verified-ngo'])
  assert.equal(
    await AuditEvent.countDocuments({
      actorId: new mongoose.Types.ObjectId(userIds['verified-ngo']),
      action: 'opportunity.created',
      targetId: created.body.opportunity.id,
    }),
    1,
  )
})

test('public impact endpoint reports aggregates from MongoDB', async () => {
  await SupportRequest.create({
    title: 'Fictional request',
    category: 'Food Support',
    description: 'Fictional aggregate fixture.',
    city: 'Fictional City',
    seekerId: userIds.seeker,
    seekerName: 'Fictional seeker',
    status: 'resolved',
  })
  await SupportRequest.collection.insertMany([
    {
      title: 'Fictional Delhi request',
      category: 'Food Support',
      description: 'Fictional aggregate fixture.',
      city: 'Delhi',
      seekerId: new mongoose.Types.ObjectId(userIds.seeker),
      seekerName: 'Fictional seeker',
      status: 'submitted',
    },
    {
      title: 'Fictional lowercase Delhi request',
      category: 'Education',
      description: 'Fictional aggregate fixture.',
      city: 'delhi ',
      seekerId: new mongoose.Types.ObjectId(userIds.seeker),
      seekerName: 'Fictional seeker',
      status: 'in_progress',
    },
  ])
  const response = await request(app).get('/api/v1/impact')
  assert.equal(response.status, 200)
  assert.equal(response.body.stats.totalRequests, 3)
  assert.equal(response.body.stats.resolvedRequests, 1)
  assert.equal(response.body.stats.categoryBreakdown['Food Support'], 2)
  assert.equal(response.body.stats.categoryBreakdown.Education, 1)
  assert.equal(response.body.stats.statusBreakdown.resolved, 1)
  assert.equal(response.body.stats.statusBreakdown.submitted, 1)
  assert.equal(response.body.stats.citiesCovered, 2)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(Object.keys(response.body), ['success', 'stats'])
  assert.equal(JSON.stringify(response.body).includes('Fictional seeker'), false)
})

test('audit history is Admin-only and omits event payload details', async () => {
  assert.equal((await request(app).get('/api/v1/audit-events')).status, 401)
  assert.equal((await agent('seeker').get('/api/v1/audit-events')).status, 403)

  const response = await agent('admin').get('/api/v1/audit-events?limit=10')
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(response.body.events))
  assert.ok(response.body.events.length > 0)
  assert.equal('details' in response.body.events[0], false)
  assert.equal((await agent('admin').get('/api/v1/audit-events?limit=1000')).status, 400)
})
