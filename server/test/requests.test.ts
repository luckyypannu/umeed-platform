import assert from 'node:assert/strict'
import mongoose, { Types } from 'mongoose'
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
import { Session } from '../src/models/session.js'
import { SupportRequest } from '../src/models/support-request.js'
import { Notification } from '../src/models/private-features.js'
import { User, type UserRole, type UserStatus } from '../src/models/user.js'
import { createApp } from '../src/app.js'

const frontendOrigin = 'http://localhost:3000'
const sessionSecret = 'phase-four-request-test-secret-with-at-least-32-bytes'

let mongo: MongoMemoryReplSet
let app: ReturnType<typeof createApp>
const userIds: Record<string, string> = {}
const sessionCookies: Record<string, string> = {}
const csrfTokens: Record<string, string> = {}
const requestIds: Record<string, string> = {}

async function createFixtureUser(
  key: string,
  role: UserRole,
  status: UserStatus,
  values: Record<string, unknown> = {},
): Promise<string> {
  const { hash, salt } = await hashPassword(`fictional-${key}-password`)
  const user = await User.create({
    email: `${key}@example.test`,
    passwordHash: hash,
    salt,
    role,
    name: `Fictional ${key}`,
    phone: '0000000000',
    city: 'Test City',
    locality: 'Test District',
    orgName: role === 'ngo' ? `Fictional ${key} NGO` : '',
    operatingCity: role === 'ngo' ? 'Test City' : '',
    areasOfSupport: role === 'ngo' ? ['Food Support'] : [],
    status,
    ...values,
  })
  userIds[key] = user._id.toString()

  const token = createSessionToken()
  await Session.create({
    tokenHash: hashSessionToken(token, sessionSecret),
    userId: user._id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  sessionCookies[key] = `umeed_session=${token}`
  csrfTokens[key] = ''
  return user._id.toString()
}

async function createFixtureRequest(
  key: string,
  seekerKey = 'seekerA',
  values: Record<string, unknown> = {},
): Promise<string> {
  const supportRequest = await SupportRequest.create({
    title: `Fictional support ${key}`,
    category: 'Food Support',
    description: `Fictional description for ${key}`,
    city: 'Test City',
    locality: 'Test District',
    urgency: 'medium',
    seekerId: new Types.ObjectId(userIds[seekerKey]),
    seekerName: `Fictional ${seekerKey}`,
    seekerPhone: '0000000000',
    ...values,
  })
  requestIds[key] = supportRequest._id.toString()
  return supportRequest._id.toString()
}

function agentFor(key: string) {
  return request.agent(app).set('Cookie', sessionCookies[key])
}

function stateChange(agent: ReturnType<typeof request.agent>, key: string) {
  return agent
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfTokens[key])
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: '7.0.14' },
  })
  const config = parseEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'umeed_requests_test',
    SESSION_SECRET: sessionSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    LOG_LEVEL: 'silent',
  })
  await connectDatabase(config)
  await Promise.all([
    User.createIndexes(),
    Session.createIndexes(),
    SupportRequest.createIndexes(),
  ])
  app = createApp(config)

  await createFixtureUser('seekerA', 'seeker', 'active')
  await createFixtureUser('seekerB', 'seeker', 'active')
  await createFixtureUser('ngoVerified', 'ngo', 'verified')
  await createFixtureUser('ngoOtherCity', 'ngo', 'verified', {
    city: 'Other City',
    operatingCity: 'Other City',
  })
  await createFixtureUser('ngoPending', 'ngo', 'pending_verification')
  await createFixtureUser('volunteerA', 'volunteer', 'verified')
  await createFixtureUser('volunteerB', 'volunteer', 'verified')
  await createFixtureUser('volunteerPending', 'volunteer', 'pending_review')
  await createFixtureUser('adminA', 'admin', 'active')

  for (const key of Object.keys(userIds)) {
    const sessionToken = sessionCookies[key].slice('umeed_session='.length)
    csrfTokens[key] = createCsrfToken(sessionToken, sessionSecret)
  }

  await createFixtureRequest('own')
  await createFixtureRequest('foreign', 'seekerB')
  await createFixtureRequest('assignedNgo', 'seekerB', {
    assignedNgoId: new Types.ObjectId(userIds.ngoVerified),
    status: 'under_review',
  })
  await createFixtureRequest('assignedNgoForPending', 'seekerB', {
    assignedNgoId: new Types.ObjectId(userIds.ngoVerified),
    status: 'under_review',
  })
  await createFixtureRequest('assignedVolunteer', 'seekerB', {
    assignedNgoId: new Types.ObjectId(userIds.ngoVerified),
    assignedVolunteerId: new Types.ObjectId(userIds.volunteerA),
    status: 'in_progress',
  })
  await createFixtureRequest('wrongCity', 'seekerB', { city: 'Other City' })
  await createFixtureRequest('wrongCategory', 'seekerB', { category: 'Education' })
  await createFixtureRequest('market', 'seekerB')
})

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  }
  await mongo?.stop()
})

test('seeker request listing and details are ownership-scoped; cross-user access is hidden', async () => {
  const ownList = await agentFor('seekerA').get('/api/v1/requests')
  assert.equal(ownList.status, 200)
  assert.ok(ownList.body.requests.some((item: { id: string }) => item.id === requestIds.own))
  assert.ok(ownList.body.requests.every((item: { id: string }) => item.id !== requestIds.foreign))

  const crossListFilter = await agentFor('seekerA')
    .get(`/api/v1/requests?seekerId=${userIds.seekerB}`)
  assert.equal(crossListFilter.status, 200)
  assert.ok(crossListFilter.body.requests.every((item: { id: string }) => item.id !== requestIds.foreign))

  assert.equal((await agentFor('seekerA').get(`/api/v1/requests/${requestIds.own}`)).status, 200)
  assert.equal((await agentFor('seekerA').get(`/api/v1/requests/${requestIds.foreign}`)).status, 404)
  assert.equal(
    (await request(app).get(`/api/v1/requests/${requestIds.own}`)).status,
    401,
  )
})

test('seeker can edit only submitted own requests and cancel only eligible own requests', async () => {
  const agent = agentFor('seekerA')
  const edit = await stateChange(agent, 'seekerA')
    .patch(`/api/v1/requests/${requestIds.own}`)
    .send({ description: 'Updated fictional details' })
  assert.equal(edit.status, 200)
  assert.equal(edit.body.request.description, 'Updated fictional details')

  const foreignUpdate = await stateChange(agent, 'seekerA')
    .patch(`/api/v1/requests/${requestIds.foreign}`)
    .send({ description: 'Attempt to change another seeker request' })
  assert.equal(foreignUpdate.status, 404)

  const statusManipulation = await stateChange(agent, 'seekerA')
    .patch(`/api/v1/requests/${requestIds.own}`)
    .send({ status: 'resolved' })
  assert.equal(statusManipulation.status, 403)

  const assignmentManipulation = await stateChange(agent, 'seekerA')
    .patch(`/api/v1/requests/${requestIds.own}`)
    .send({ assignedNgoId: userIds.ngoVerified })
  assert.equal(assignmentManipulation.status, 403)

  const cancel = await stateChange(agent, 'seekerA')
    .patch(`/api/v1/requests/${requestIds.own}`)
    .send({ status: 'cancelled' })
  assert.equal(cancel.status, 200)
  assert.equal(cancel.body.request.status, 'cancelled')
  assert.ok(await Notification.findOne({
    recipientId: userIds.seekerA,
    message: 'Your support request status changed to cancelled.',
  }))

  const editCancelled = await stateChange(agent, 'seekerA')
    .patch(`/api/v1/requests/${requestIds.own}`)
    .send({ description: 'Cannot update cancelled request' })
  assert.equal(editCancelled.status, 409)

  const create = await stateChange(agent, 'seekerA')
    .post('/api/v1/requests')
    .send({
      category: 'Food Support',
      description: 'A new fictional request',
      city: 'Test City',
      seekerId: userIds.seekerB,
      seekerName: 'Forged identity',
      phone: '9999999999',
    })
  assert.equal(create.status, 400)

  const validCreate = await stateChange(agent, 'seekerA')
    .post('/api/v1/requests')
    .send({
      category: 'Food Support',
      description: 'A new fictional request',
      city: 'Test City',
      locality: 'Test District',
    })
  assert.equal(validCreate.status, 201)
  assert.equal(validCreate.body.request.seekerName, 'Fictional seekerA')
  assert.equal(validCreate.body.request.seekerPhone, '0000000000')
  assert.ok(await Notification.findOne({
    recipientId: userIds.seekerA,
    message: 'Your support request has been submitted successfully.',
  }))
})

test('NGO sees only verified matching or assigned requests and can only assign itself', async () => {
  const ngo = agentFor('ngoVerified')
  const list = await ngo.get('/api/v1/requests')
  assert.equal(list.status, 200)
  const ids = list.body.requests.map((item: { id: string }) => item.id)
  assert.ok(ids.includes(requestIds.market))
  assert.ok(ids.includes(requestIds.assignedNgo))
  assert.ok(!ids.includes(requestIds.wrongCity))
  assert.ok(!ids.includes(requestIds.wrongCategory))

  const matchingDetails = await ngo.get(`/api/v1/requests/${requestIds.market}`)
  assert.equal(matchingDetails.status, 200)
  assert.equal('seekerPhone' in matchingDetails.body.request, false)
  assert.equal('seekerName' in matchingDetails.body.request, false)

  assert.equal((await ngo.get(`/api/v1/requests/${requestIds.foreign}`)).status, 200)
  assert.equal((await ngo.get(`/api/v1/requests/${requestIds.wrongCity}`)).status, 404)
  assert.equal((await agentFor('ngoPending').get('/api/v1/requests')).status, 403)
  assert.equal((await agentFor('ngoOtherCity').get(`/api/v1/requests/${requestIds.own}`)).status, 404)

  const assignOther = await stateChange(ngo, 'ngoVerified')
    .patch(`/api/v1/requests/${requestIds.market}`)
    .send({ assignedNgoId: userIds.ngoOtherCity, assignedNgoName: 'Forged NGO' })
  assert.equal(assignOther.status, 403)

  const assignSelf = await stateChange(ngo, 'ngoVerified')
    .patch(`/api/v1/requests/${requestIds.market}`)
    .send({
      assignedNgoId: userIds.ngoVerified,
      assignedNgoName: 'Forged label',
      status: 'in_progress',
      note: 'Fictional action started',
    })
  assert.equal(assignSelf.status, 200)
  assert.equal(assignSelf.body.request.assignedNgoId, userIds.ngoVerified)
  assert.equal(assignSelf.body.request.assignedNgoName, 'Fictional ngoVerified NGO')
  assert.equal(assignSelf.body.request.seekerPhone, '0000000000')
})

test('NGO can assign only verified volunteers to its own eligible assignments', async () => {
  const ngo = agentFor('ngoVerified')
  const assignVolunteer = await stateChange(ngo, 'ngoVerified')
    .patch(`/api/v1/requests/${requestIds.assignedNgo}`)
    .send({ assignedVolunteerId: userIds.volunteerB })
  assert.equal(assignVolunteer.status, 200)
  assert.equal(assignVolunteer.body.request.assignedVolunteerId, userIds.volunteerB)

  const pendingVolunteer = await createFixtureUser('volunteerPending2', 'volunteer', 'pending_review')
  const invalidAssignment = await stateChange(ngo, 'ngoVerified')
    .patch(`/api/v1/requests/${requestIds.assignedNgoForPending}`)
    .send({ assignedVolunteerId: pendingVolunteer })
  assert.equal(invalidAssignment.status, 400)

  const otherNgoAssignment = await stateChange(agentFor('ngoOtherCity'), 'ngoOtherCity')
    .patch(`/api/v1/requests/${requestIds.assignedNgo}`)
    .send({ note: 'Unauthorized note' })
  assert.equal(otherNgoAssignment.status, 404)
})

test('volunteer may view only assigned requests and submit completion workflow updates', async () => {
  const volunteer = agentFor('volunteerA')
  const list = await volunteer.get('/api/v1/requests')
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.requests.map((item: { id: string }) => item.id), [requestIds.assignedVolunteer])

  assert.equal((await volunteer.get(`/api/v1/requests/${requestIds.assignedVolunteer}`)).status, 200)
  assert.equal((await volunteer.get(`/api/v1/requests/${requestIds.own}`)).status, 404)
  assert.equal((await agentFor('volunteerB').get(`/api/v1/requests/${requestIds.assignedVolunteer}`)).status, 404)

  const fractionalRating = await stateChange(agentFor('seekerB'), 'seekerB')
    .patch(`/api/v1/requests/${requestIds.assignedVolunteer}`)
    .send({ rating: 4.5 })
  assert.equal(fractionalRating.status, 400)

  const volunteerComplete = await stateChange(volunteer, 'volunteerA')
    .patch(`/api/v1/requests/${requestIds.assignedVolunteer}`)
    .send({ status: 'awaiting_beneficiary_verification', completionReport: 'Delivered groceries and checked in with the beneficiary.' })
  assert.equal(volunteerComplete.status, 200)
  assert.equal(volunteerComplete.body.request.status, 'awaiting_beneficiary_verification')
  assert.equal(volunteerComplete.body.request.completionReport, 'Delivered groceries and checked in with the beneficiary.')

  const seekerConfirms = await stateChange(agentFor('seekerB'), 'seekerB')
    .patch(`/api/v1/requests/${requestIds.assignedVolunteer}`)
    .send({ status: 'verified_completed', rating: 5 })
  assert.equal(seekerConfirms.status, 200)
  assert.equal(seekerConfirms.body.request.status, 'verified_completed')
  assert.equal(seekerConfirms.body.request.rating, 5)

  const duplicateConfirm = await stateChange(agentFor('seekerB'), 'seekerB')
    .patch(`/api/v1/requests/${requestIds.assignedVolunteer}`)
    .send({ status: 'verified_completed' })
  assert.equal(duplicateConfirm.status, 409)

  const duplicateRating = await stateChange(agentFor('seekerB'), 'seekerB')
    .patch(`/api/v1/requests/${requestIds.assignedVolunteer}`)
    .send({ rating: 4 })
  assert.equal(duplicateRating.status, 409)

  const volunteerSelfVerify = await stateChange(volunteer, 'volunteerA')
    .patch(`/api/v1/requests/${requestIds.assignedVolunteer}`)
    .send({ status: 'verified_completed' })
  assert.equal(volunteerSelfVerify.status, 409)
})

test('Admin request reads and updates are authorized and audited', async () => {
  const admin = agentFor('adminA')
  const list = await admin.get('/api/v1/requests')
  assert.equal(list.status, 200)
  assert.ok(list.body.requests.length >= 5)

  const detail = await admin.get(`/api/v1/requests/${requestIds.foreign}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.body.request.seekerPhone, '0000000000')

  const assignment = await stateChange(admin, 'adminA')
    .patch(`/api/v1/requests/${requestIds.foreign}`)
    .send({ assignedNgoId: userIds.ngoVerified })
  assert.equal(assignment.status, 200)

  const audit = await mongoose.connection.collection('auditevents')
    .find({ actorId: new Types.ObjectId(userIds.adminA) }).toArray()
  assert.ok(audit.some((event) => event.action === 'request.list.accessed'))
  assert.ok(audit.some((event) => event.action === 'request.detail.accessed'))
  assert.ok(audit.some((event) => event.action === 'request.assignment.changed'))
})

test('status transitions reject skips, terminal changes, and concurrent stale writes', async () => {
  const first = await createFixtureRequest('raceStart')
  const agent = agentFor('ngoVerified')
  const firstWrite = stateChange(agent, 'ngoVerified')
    .patch(`/api/v1/requests/${first}`)
    .send({ assignedNgoId: userIds.ngoVerified, status: 'in_progress' })
  const competingWrite = stateChange(agent, 'ngoVerified')
    .patch(`/api/v1/requests/${first}`)
    .send({ assignedNgoId: userIds.ngoVerified, status: 'under_review' })
  const [firstResponse, secondResponse] = await Promise.all([firstWrite, competingWrite])
  assert.equal(firstResponse.status, 200)
  assert.equal(secondResponse.status, 409)

  const resolvedToActive = await stateChange(agent, 'ngoVerified')
    .patch(`/api/v1/requests/${first}`)
    .send({ status: 'submitted' })
  assert.equal(resolvedToActive.status, 409)

  const current = await SupportRequest.findById(first).select('status')
  assert.ok(current)
  if (current.status === 'under_review') {
    const start = await stateChange(agent, 'ngoVerified')
      .patch(`/api/v1/requests/${first}`)
      .send({ status: 'in_progress' })
    assert.equal(start.status, 200)
  }

  const markResolved = await stateChange(agent, 'ngoVerified')
    .patch(`/api/v1/requests/${first}`)
    .send({ status: 'resolved' })
  assert.equal(markResolved.status, 200)

  const changeResolved = await stateChange(agent, 'ngoVerified')
    .patch(`/api/v1/requests/${first}`)
    .send({ status: 'in_progress' })
  assert.equal(changeResolved.status, 409)
})

test('verification routes require Admin, validate role/status, prevent self-verification, and audit decisions', async () => {
  const ngo = await createFixtureUser('verifyTargetNgo', 'ngo', 'pending_verification')
  const volunteer = await createFixtureUser('verifyTargetVolunteer', 'volunteer', 'pending_review')
  const admin = agentFor('adminA')

  const seekerAttempt = await stateChange(agentFor('seekerA'), 'seekerA')
    .patch(`/api/v1/ngos/${ngo}/verify`)
    .send({ status: 'verified' })
  assert.equal(seekerAttempt.status, 403)

  const selfTarget = await stateChange(admin, 'adminA')
    .patch(`/api/v1/ngos/${userIds.adminA}/verify`)
    .send({ status: 'verified' })
  assert.equal(selfTarget.status, 404)

  const invalid = await stateChange(admin, 'adminA')
    .patch(`/api/v1/ngos/${ngo}/verify`)
    .send({ status: 'pending_verification' })
  assert.equal(invalid.status, 400)

  const verifiedNgo = await stateChange(admin, 'adminA')
    .patch(`/api/v1/ngos/${ngo}/verify`)
    .send({ status: 'verified' })
  assert.equal(verifiedNgo.status, 200)
  assert.equal(verifiedNgo.body.ngo.status, 'verified')
  assert.equal('phone' in verifiedNgo.body.ngo, false)

  const repeatedDecision = await stateChange(admin, 'adminA')
    .patch(`/api/v1/ngos/${ngo}/verify`)
    .send({ status: 'rejected' })
  assert.equal(repeatedDecision.status, 409)

  const rejectedVolunteer = await stateChange(admin, 'adminA')
    .patch(`/api/v1/volunteers/${volunteer}/verify`)
    .send({ status: 'rejected' })
  assert.equal(rejectedVolunteer.status, 200)
  assert.equal(rejectedVolunteer.body.volunteer.status, 'rejected')

  const wrongEntity = await stateChange(admin, 'adminA')
    .patch(`/api/v1/ngos/${volunteer}/verify`)
    .send({ status: 'verified' })
  assert.equal(wrongEntity.status, 404)

  const audit = await mongoose.connection.collection('auditevents')
    .find({
      actorId: new Types.ObjectId(userIds.adminA),
      action: { $regex: /^verification\./ },
    }).toArray()
  assert.ok(audit.some((event) => event.targetId === ngo && event.toStatus === 'verified'))
  assert.ok(audit.some((event) => event.targetId === volunteer && event.toStatus === 'rejected'))
  assert.ok(audit.some((event) => event.targetId === ngo && event.outcome === 'conflict'))
})
