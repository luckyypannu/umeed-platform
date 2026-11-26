import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'
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
import { ChatSession, EmergencyRecord, Notification } from '../src/models/private-features.js'
import { Session } from '../src/models/session.js'
import { User, type UserRole, type UserStatus } from '../src/models/user.js'
import { createApp } from '../src/app.js'

const frontendOrigin = 'http://localhost:3000'
const sessionSecret = 'phase-five-private-test-secret-with-at-least-32-bytes'
const jwtSecret = 'phase-five-jwt-test-secret-with-at-least-32-bytes'

let mongo: MongoMemoryReplSet
let app: ReturnType<typeof createApp>
const userIds: Record<string, string> = {}
const cookies: Record<string, string> = {}
const csrfTokens: Record<string, string> = {}

async function createFixtureUser(
  key: string,
  role: UserRole,
  status: UserStatus,
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
    locality: 'Private Test District',
    address: 'Fictional private address',
    skills: 'Fictional teaching skill',
    interests: 'Fictional community work',
    areasOfSupport: ['Food Support'],
    availableDays: 'Fictional weekdays',
    motivation: 'Fictional volunteer motivation',
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
  return user._id.toString()
}

function agentFor(key: string) {
  return request.agent(app).set('Cookie', cookies[key])
}

function stateChange(agent: ReturnType<typeof request.agent>, key: string) {
  return agent
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfTokens[key])
}

function getSetCookie(response: request.Response, name: string): string {
  const setCookies = response.headers['set-cookie'] as string[] | undefined
  assert.ok(setCookies)
  const cookie = setCookies.find((value) => value.startsWith(`${name}=`))
  assert.ok(cookie)
  return cookie.split(';', 1)[0]
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: '7.0.14' },
  })
  const config = parseEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'umeed_private_features_test',
    SESSION_SECRET: sessionSecret,
    JWT_SECRET: jwtSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    LOG_LEVEL: 'silent',
  })
  await connectDatabase(config)
  await Promise.all([
    AuditEvent.createIndexes(),
    ChatSession.createIndexes(),
    EmergencyRecord.createIndexes(),
    Notification.createIndexes(),
    Session.createIndexes(),
    User.createIndexes(),
  ])
  app = createApp(config)

  await createFixtureUser('seekerA', 'seeker', 'active')
  await createFixtureUser('seekerB', 'seeker', 'active')
  await createFixtureUser('adminA', 'admin', 'active')
  await createFixtureUser('volunteerA', 'volunteer', 'verified')
  await createFixtureUser('volunteerB', 'volunteer', 'verified')
  await createFixtureUser('volunteerPending', 'volunteer', 'pending_review')
  await createFixtureUser('ngoA', 'ngo', 'verified')
})

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  }
  await mongo?.stop()
})

test('emergency records require consent and anonymous owner credentials; reads are audited and minimized', async () => {
  const noConsent = await request(app)
    .post('/api/v1/emergency')
    .set('Origin', frontendOrigin)
    .send({ latitude: 12.34567, longitude: 76.54321 })
  assert.equal(noConsent.status, 400)

  const unauthenticatedRead = await request(app).get('/api/v1/emergency')
  assert.equal(unauthenticatedRead.status, 401)

  const create = await request(app)
    .post('/api/v1/emergency')
    .set('Origin', frontendOrigin)
    .send({ latitude: 12.34567, longitude: 76.54321, accuracy: 9, consent: true })
  assert.equal(create.status, 201)
  assert.match(create.body.message, /does not contact or dispatch/)
  assert.equal('name' in create.body.alert, false)
  assert.equal('contact' in create.body.alert, false)
  assert.equal('address' in create.body.alert, false)
  const ownerCookie = getSetCookie(create, 'umeed_emergency')

  const ownerRead = await request(app)
    .get('/api/v1/emergency')
    .set('Cookie', ownerCookie)
  assert.equal(ownerRead.status, 200)
  assert.equal(ownerRead.body.alerts.length, 1)
  assert.equal(ownerRead.body.alerts[0].latitude, 12.34567)
  assert.equal(ownerRead.body.alerts[0].accuracy, 9)

  const suppliedToken = randomBytes(32).toString('base64url')
  const attackerChosenCredential = await request(app)
    .post('/api/v1/emergency')
    .set('Origin', frontendOrigin)
    .set('Cookie', `umeed_emergency=${suppliedToken}`)
    .send({ latitude: 10, longitude: 70, consent: true })
  assert.equal(attackerChosenCredential.status, 201)
  const issuedCredential = getSetCookie(attackerChosenCredential, 'umeed_emergency')
  assert.notEqual(issuedCredential, `umeed_emergency=${suppliedToken}`)

  const otherOwnerRead = await request(app)
    .get('/api/v1/emergency')
    .set('Cookie', `umeed_emergency=${randomBytes(32).toString('base64url')}`)
  assert.equal(otherOwnerRead.status, 200)
  assert.deepEqual(otherOwnerRead.body.alerts, [])

  const recordId = create.body.alert.id
  const audit = await AuditEvent.find({ targetId: recordId }).sort({ createdAt: 1 }).lean()
  assert.deepEqual(audit.map((event) => event.action), [
    'emergency.record.created',
    'emergency.record.accessed',
  ])
  assert.equal(audit[0].actorRole, 'anonymous')
  assert.equal(audit[0].actorId, null)
})

test('emergency ownership is enforced for signed-in users; Admin authorization and responder access are audited', async () => {
  const create = await stateChange(agentFor('seekerA'), 'seekerA')
    .post('/api/v1/emergency')
    .send({ latitude: -21.12345, longitude: 72.98765, accuracy: 5, consent: true })
  assert.equal(create.status, 201)

  const ownRead = await agentFor('seekerA').get('/api/v1/emergency')
  assert.equal(ownRead.status, 200)
  assert.equal(ownRead.body.alerts.length, 1)
  assert.equal(ownRead.body.alerts[0].latitude, -21.12345)

  const otherRead = await agentFor('seekerB').get('/api/v1/emergency')
  assert.equal(otherRead.status, 200)
  assert.deepEqual(otherRead.body.alerts, [])
  assert.equal(
    (await agentFor('seekerA').get('/api/v1/emergency?ownerUserId=' + userIds.seekerB)).status,
    400,
  )

  const pendingOwnerCreate = await stateChange(agentFor('volunteerPending'), 'volunteerPending')
    .post('/api/v1/emergency')
    .send({ latitude: 8.12345, longitude: 75.98765, consent: true })
  assert.equal(pendingOwnerCreate.status, 201)
  const pendingOwnerRead = await agentFor('volunteerPending').get('/api/v1/emergency')
  assert.ok(pendingOwnerRead.body.alerts.some(
    (record: { id: string; latitude: number }) =>
      record.id === pendingOwnerCreate.body.alert.id && record.latitude === 8.12345,
  ))

  const recordId = create.body.alert.id
  const authorize = await stateChange(agentFor('adminA'), 'adminA')
    .patch(`/api/v1/emergency/${recordId}/responders`)
    .send({ responderIds: [userIds.volunteerA] })
  assert.equal(authorize.status, 200)
  const unauthorizedAdminAction = await stateChange(agentFor('seekerA'), 'seekerA')
    .patch(`/api/v1/emergency/${recordId}/responders`)
    .send({ responderIds: [] })
  assert.equal(unauthorizedAdminAction.status, 403)

  const responderRead = await agentFor('volunteerA').get('/api/v1/emergency')
  assert.equal(responderRead.status, 200)
  assert.equal(responderRead.body.alerts.length, 1)
  assert.equal(responderRead.body.alerts[0].latitude, -21.12)
  assert.equal('accuracy' in responderRead.body.alerts[0], false)
  assert.equal(
    (await stateChange(agentFor('volunteerA'), 'volunteerA')
      .delete(`/api/v1/emergency/${recordId}`)).status,
    404,
  )

  const adminRead = await agentFor('adminA').get('/api/v1/emergency')
  assert.equal(adminRead.status, 200)
  const adminRecord = adminRead.body.alerts.find(
    (record: { id: string }) => record.id === recordId,
  )
  assert.ok(adminRecord)
  assert.equal(adminRecord.latitude, -21.12345)
  const events = await AuditEvent.find({ targetId: recordId }).lean()
  assert.ok(events.some((event) => event.action === 'emergency.responders.authorized'))
  assert.ok(events.some((event) => event.action === 'emergency.record.accessed' && event.actorRole === 'admin'))
})

test('anonymous chat capabilities isolate history and reject caller-supplied session IDs', async () => {
  const firstHistory = await request(app).get('/api/v1/chat')
  assert.equal(firstHistory.status, 200)
  assert.equal(firstHistory.body.assistantType, 'rule-based')
  const firstCookie = getSetCookie(firstHistory, 'umeed_chat_session')

  const firstPost = await request(app)
    .post('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .set('Cookie', firstCookie)
    .send({ text: 'How do I submit a request?' })
  assert.equal(firstPost.status, 200)
  assert.equal(firstPost.body.assistantType, 'rule-based')
  assert.equal('sessionId' in firstPost.body.userMessage, false)
  assert.equal('userId' in firstPost.body.userMessage, false)

  const volunteerHelp = await request(app)
    .post('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .set('Cookie', firstCookie)
    .send({ text: 'How can a volunteer help?' })
  assert.equal(volunteerHelp.status, 200)
  assert.match(volunteerHelp.body.assistantMessage.text, /volunteer account/)

  const incidentalHi = await request(app)
    .post('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .set('Cookie', firstCookie)
    .send({ text: 'Which things are in this community?' })
  assert.equal(incidentalHi.status, 200)
  assert.match(incidentalHi.body.assistantMessage.text, /rule-based assistant/)

  const arbitrarySession = await request(app)
    .post('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .set('Cookie', firstCookie)
    .send({ text: 'hello', sessionId: 'another-session' })
  assert.equal(arbitrarySession.status, 400)
  assert.equal((await request(app).get('/api/v1/chat?sessionId=default')).status, 400)

  const secondPost = await request(app)
    .post('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .send({ text: 'hello' })
  assert.equal(secondPost.status, 200)
  assert.match(secondPost.body.assistantMessage.text, /^Hello\./)
  const secondCookie = getSetCookie(secondPost, 'umeed_chat_session')
  assert.notEqual(firstCookie, secondCookie)

  const firstRead = await request(app).get('/api/v1/chat').set('Cookie', firstCookie)
  const secondRead = await request(app).get('/api/v1/chat').set('Cookie', secondCookie)
  assert.equal(firstRead.body.messages.length, 6)
  assert.equal(firstRead.body.messages[0].text, 'How do I submit a request?')
  assert.equal(secondRead.body.messages.length, 2)
  assert.equal(secondRead.body.messages[0].text, 'hello')
  assert.equal(await ChatSession.countDocuments(), 2)
})

test('expired anonymous chat credentials cannot retrieve history', async () => {
  const created = await request(app).get('/api/v1/chat')
  const cookie = getSetCookie(created, 'umeed_chat_session')
  const token = cookie.slice('umeed_chat_session='.length)
  await ChatSession.updateOne(
    { credentialHash: hashSessionToken(token, sessionSecret) },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  )
  const expired = await request(app).get('/api/v1/chat').set('Cookie', cookie)
  assert.equal(expired.status, 401)
})

test('anonymous chat history can be cleared only with its session credential', async () => {
  const created = await request(app).get('/api/v1/chat')
  const cookie = getSetCookie(created, 'umeed_chat_session')
  const sent = await request(app)
    .post('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .set('Cookie', cookie)
    .send({ text: 'hello' })
  assert.equal(sent.status, 200)

  const denied = await request(app)
    .delete('/api/v1/chat')
    .set('Origin', frontendOrigin)
  assert.equal(denied.status, 404)

  const cleared = await request(app)
    .delete('/api/v1/chat')
    .set('Origin', frontendOrigin)
    .set('Cookie', cookie)
  assert.equal(cleared.status, 200)
  const history = await request(app).get('/api/v1/chat').set('Cookie', cookie)
  assert.equal(history.body.messages.length, 0)
})

test('public volunteer directory returns only verified profiles and excludes private fields', async () => {
  const response = await request(app).get('/api/v1/volunteers')
  assert.equal(response.status, 200)
  const ids = response.body.volunteers.map((volunteer: { id: string }) => volunteer.id)
  assert.ok(ids.includes(userIds.volunteerA))
  assert.ok(!ids.includes(userIds.volunteerPending))
  const profile = response.body.volunteers.find(
    (volunteer: { id: string }) => volunteer.id === userIds.volunteerA,
  )
  assert.equal(profile.name, 'Fictional volunteerA')
  assert.equal(profile.city, 'Test City')
  for (const privateField of ['email', 'phone', 'locality', 'address', 'motivation', 'skills', 'interests', 'availableDays', 'areasOfSupport', 'status', 'passwordHash', 'salt']) {
    assert.equal(privateField in profile, false)
  }
  assert.equal((await request(app).get('/api/v1/volunteers?all=true')).status, 401)
})

test('volunteer profile writes require the authenticated volunteer and cannot change identity or status', async () => {
  const unauthenticated = await request(app)
    .post('/api/v1/volunteers')
    .set('Origin', frontendOrigin)
    .send({ fullName: 'Fictional applicant' })
  assert.equal(unauthenticated.status, 401)

  const spoofed = await stateChange(agentFor('volunteerA'), 'volunteerA')
    .post('/api/v1/volunteers')
    .send({ fullName: 'Fictional Volunteer', status: 'verified', userId: userIds.volunteerB })
  assert.equal(spoofed.status, 400)

  const update = await stateChange(agentFor('volunteerA'), 'volunteerA')
    .post('/api/v1/volunteers')
    .send({
      fullName: 'Fictional Updated Volunteer',
      phone: '0000000001',
      motivation: 'Updated fictional private motivation',
    })
  assert.equal(update.status, 200)
  assert.equal(update.body.volunteer.name, 'Fictional Updated Volunteer')
  assert.equal(update.body.volunteer.status, 'verified')
  assert.equal('passwordHash' in update.body.volunteer, false)
  assert.equal((await User.findById(userIds.volunteerA).select('+passwordHash')).status, 'verified')
})

test('notifications are scoped to the authenticated recipient for reads and updates', async () => {
  const recipientNotification = await Notification.create({
    recipientId: userIds.seekerA,
    message: 'Fictional private notification for seeker A',
    type: 'info',
  })
  const otherNotification = await Notification.create({
    recipientId: userIds.seekerB,
    message: 'Fictional private notification for seeker B',
    type: 'alert',
  })

  assert.equal((await request(app).get('/api/v1/notifications')).status, 401)
  const list = await agentFor('seekerA').get('/api/v1/notifications')
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.notifications.map((item: { id: string }) => item.id), [
    recipientNotification._id.toString(),
  ])
  assert.equal('userId' in list.body.notifications[0], false)
  assert.equal((await agentFor('seekerA').get('/api/v1/notifications?userId=' + userIds.seekerB)).status, 400)

  const crossUserUpdate = await stateChange(agentFor('seekerA'), 'seekerA')
    .post('/api/v1/notifications')
    .send({ notificationId: otherNotification._id.toString() })
  assert.equal(crossUserUpdate.status, 404)
  assert.equal((await Notification.findById(otherNotification._id))?.read, false)

  const ownerUpdate = await stateChange(agentFor('seekerA'), 'seekerA')
    .post('/api/v1/notifications')
    .send({ notificationId: recipientNotification._id.toString() })
  assert.equal(ownerUpdate.status, 200)
  assert.equal((await Notification.findById(recipientNotification._id))?.read, true)

  const adminCannotReadOthers = await agentFor('adminA').get('/api/v1/notifications')
  assert.equal(adminCannotReadOthers.status, 200)
  assert.deepEqual(adminCannotReadOthers.body.notifications, [])
})
