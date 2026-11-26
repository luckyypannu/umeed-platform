import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import {
  createCsrfToken,
  hashPassword,
  hashSessionToken,
  verifyCsrfToken,
} from '../src/auth/crypto.js'
import { requireRoles } from '../src/auth/middleware.js'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'
import { Session } from '../src/models/session.js'
import { User } from '../src/models/user.js'

const frontendOrigin = 'http://localhost:3000'
const sessionSecret = 'isolated-test-session-secret-with-over-32-bytes'
let mongo: MongoMemoryServer
let app: ReturnType<typeof createApp>
let seekerId = ''

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  const config = parseEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: 'umeed_auth_test',
    SESSION_SECRET: sessionSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    TRUST_PROXY: 1,
    LOG_LEVEL: 'silent',
  })
  await connectDatabase(config)
  await Promise.all([User.createIndexes(), Session.createIndexes()])
  app = createApp(config)

  const { hash, salt } = await hashPassword('fixture-password-123')
  const seeker = await User.create({
    email: 'fictional.seeker@example.test',
    passwordHash: hash,
    salt,
    role: 'seeker',
    name: 'Fictional Seeker',
    phone: '0000000000',
    city: 'Test City',
    locality: 'Test District',
    status: 'active',
  })
  seekerId = seeker._id.toString()
})

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  }
  await mongo?.stop()
})

test('public registration allows only seeker, NGO, and volunteer with strict fields', async () => {
  const adminSignup = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', frontendOrigin)
    .send({
      role: 'admin',
      email: 'admin@example.test',
      password: 'fictional-password-123',
      fullName: 'Fictional Admin',
      phone: '0000000000',
      city: 'Test City',
      locality: 'Test District',
    })
  assert.equal(adminSignup.status, 400)
  assert.equal(await User.countDocuments({ role: 'admin' }), 0)

  const missingOrigin = await request(app)
    .post('/api/v1/auth/register')
    .send({
      role: 'seeker',
      email: 'new.seeker@example.test',
      password: 'fictional-password-123',
      fullName: 'Fictional New Seeker',
      phone: '0000000000',
      city: 'Test City',
      locality: 'Test District',
    })
  assert.equal(missingOrigin.status, 403)

  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', frontendOrigin)
    .send({
      role: 'seeker',
      email: 'new.seeker@example.test',
      password: 'fictional-password-123',
      fullName: 'Fictional New Seeker',
      phone: '0000000000',
      city: 'Test City',
      locality: 'Test District',
      isAdmin: true,
    })
  assert.equal(response.status, 400)

  const created = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', frontendOrigin)
    .send({
      role: 'seeker',
      email: 'new.seeker@example.test',
      password: 'fictional-password-123',
      fullName: 'Fictional New Seeker',
      phone: '0000000000',
      city: 'Test City',
      locality: 'Test District',
    })
  assert.equal(created.status, 201)
  assert.equal(created.body.user.role, 'seeker')
  assert.equal('passwordHash' in created.body.user, false)
  assert.equal('salt' in created.body.user, false)

  const duplicate = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', frontendOrigin)
    .send({
      role: 'seeker',
      email: 'NEW.SEEKER@example.test',
      password: 'fictional-password-123',
      fullName: 'Fictional Duplicate',
      phone: '0000000000',
      city: 'Test City',
      locality: 'Test District',
    })
  assert.equal(duplicate.status, 409)
})

test('login creates an HttpOnly database session; invalid role and bearer-only access fail', async () => {
  const mismatch = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', frontendOrigin)
    .send({
      email: 'fictional.seeker@example.test',
      password: 'fixture-password-123',
      role: 'volunteer',
    })
  assert.equal(mismatch.status, 403)

  const agent = request.agent(app)
  const login = await agent
    .post('/api/v1/auth/login')
    .set('Origin', frontendOrigin)
    .send({
      email: 'fictional.seeker@example.test',
      password: 'fixture-password-123',
      role: 'seeker',
    })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.id, seekerId)
  assert.equal(typeof login.body.csrfToken, 'string')

  const setCookie = (login.headers['set-cookie'] as string[])[0]
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.match(setCookie, /Max-Age=28800/i)

  const rawCookie = setCookie.split(';')[0]
  const rawSessionToken = rawCookie.slice('umeed_session='.length)
  const storedSession = await Session.findOne({
    tokenHash: hashSessionToken(rawSessionToken, sessionSecret),
  }).lean()
  assert.ok(storedSession)
  assert.notEqual(storedSession.tokenHash, rawSessionToken)
  assert.equal(storedSession.revokedAt, null)

  const currentUser = await agent.get('/api/v1/auth/me')
  assert.equal(currentUser.status, 200)
  assert.equal(currentUser.body.user.email, 'fictional.seeker@example.test')
  assert.equal(currentUser.headers['cache-control'], 'no-store')

  const noCookie = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', 'Bearer unused-token')
  assert.equal(noCookie.status, 401)

  const csrfToken = login.body.csrfToken as string
  const missingCsrf = await agent
    .put('/api/v1/auth/me')
    .set('Origin', frontendOrigin)
    .send({ city: 'Updated Test City' })
  assert.equal(missingCsrf.status, 403)

  const incorrectCsrf = await agent
    .put('/api/v1/auth/me')
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', 'invalid')
    .send({ city: 'Updated Test City' })
  assert.equal(incorrectCsrf.status, 403)

  const updated = await agent
    .put('/api/v1/auth/me')
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfToken)
    .send({
      city: 'Updated Test City',
      skills: 'Fictional tutoring skill',
      interests: 'Fictional community activity',
      availableDays: 'Weekends',
      areasOfSupport: ['Education', 'Food Support'],
    })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.user.city, 'Updated Test City')
  assert.deepEqual(updated.body.user.areasOfSupport, ['Education', 'Food Support'])
  assert.equal((await User.findById(seekerId).lean())?.skills, 'Fictional tutoring skill')

  const privilegeEscalation = await agent
    .put('/api/v1/auth/me')
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfToken)
    .send({ role: 'admin' })
  assert.equal(privilegeEscalation.status, 400)

  const blankRequiredField = await agent
    .put('/api/v1/auth/me')
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfToken)
    .send({ city: '  ' })
  assert.equal(blankRequiredField.status, 400)

  const logout = await agent
    .post('/api/v1/auth/logout')
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfToken)
  assert.equal(logout.status, 200)
  assert.match((logout.headers['set-cookie'] as string[])[0], /Max-Age=0/i)
  assert.equal((await agent.get('/api/v1/auth/me')).status, 401)
  const revokedSession = await Session.findById(storedSession._id).lean()
  assert.ok(revokedSession?.revokedAt)
})

test('login attempts from one IP do not lock the account for another IP', async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const failedLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', frontendOrigin)
      .set('X-Forwarded-For', '203.0.113.10')
      .send({
        email: 'fictional.seeker@example.test',
        password: 'incorrect-password',
      })
    assert.equal(failedLogin.status, 401)
  }

  const attackIpLocked = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', frontendOrigin)
    .set('X-Forwarded-For', '203.0.113.10')
    .send({
      email: 'fictional.seeker@example.test',
      password: 'incorrect-password',
    })
  assert.equal(attackIpLocked.status, 429)

  const victimLogin = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', frontendOrigin)
    .set('X-Forwarded-For', '203.0.113.11')
    .send({
      email: 'fictional.seeker@example.test',
      password: 'fixture-password-123',
    })
  assert.equal(victimLogin.status, 200)
})

test('verified NGO organization details require admin assistance but other profile fields remain editable', async () => {
  const { hash, salt } = await hashPassword('fictional-ngo-password-123')
  await User.create({
    email: 'verified.ngo@example.test',
    passwordHash: hash,
    salt,
    role: 'ngo',
    status: 'verified',
    name: 'Fictional Verified NGO',
    orgName: 'Fictional Verified NGO',
    contactPerson: 'Fictional Contact',
    address: 'Fictional NGO address',
    operatingCity: 'Fictional City',
    phone: '0000000000',
    city: 'Fictional City',
    locality: '',
  })

  const agent = request.agent(app)
  const login = await agent
    .post('/api/v1/auth/login')
    .set('Origin', frontendOrigin)
    .send({
      email: 'verified.ngo@example.test',
      password: 'fictional-ngo-password-123',
    })
  assert.equal(login.status, 200)
  const csrfToken = login.body.csrfToken as string

  for (const field of ['orgName', 'contactPerson', 'address', 'operatingCity']) {
    const response = await agent
      .put('/api/v1/auth/me')
      .set('Origin', frontendOrigin)
      .set('X-CSRF-Token', csrfToken)
      .send({ [field]: 'Fictional changed detail' })
    assert.equal(response.status, 403)
    assert.equal(response.body.error, 'Contact an admin to change verified organization details')
  }

  const editable = await agent
    .put('/api/v1/auth/me')
    .set('Origin', frontendOrigin)
    .set('X-CSRF-Token', csrfToken)
    .send({ phone: '0000000001' })
  assert.equal(editable.status, 200)
  assert.equal(editable.body.user.phone, '0000000001')
})

test('expired sessions cannot authenticate even before TTL cleanup', async () => {
  const expiredToken = 'A'.repeat(43)
  await Session.create({
    tokenHash: hashSessionToken(expiredToken, sessionSecret),
    userId: new mongoose.Types.ObjectId(seekerId),
    expiresAt: new Date(Date.now() - 60_000),
    revokedAt: null,
  })

  const response = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', `umeed_session=${expiredToken}`)
  assert.equal(response.status, 401)
})

test('role middleware denies a seeker and permits an admin', async () => {
  const makeRoleApp = (role: 'seeker' | 'admin') => {
    const roleApp = express()
    roleApp.get(
      '/',
      (request, _response, next) => {
        request.auth = {
          user: {
            id: 'fictional-user-id',
            email: 'fixture@example.test',
            role,
            status: 'active',
          },
          sessionId: 'fictional-session-id',
          sessionToken: 'fictional-session-token',
        }
        next()
      },
      requireRoles('admin'),
      (_request, response) => response.sendStatus(204),
    )
    return roleApp
  }

  assert.equal((await request(makeRoleApp('seeker')).get('/')).status, 403)
  assert.equal((await request(makeRoleApp('admin')).get('/')).status, 204)
})

test('Mongoose schemas reject undeclared fields and expose required indexes', async () => {
  const invalidUser = {
    email: 'strict.user@example.test',
    passwordHash: 'a'.repeat(128),
    salt: 'b'.repeat(32),
    role: 'seeker',
    name: 'Fictional User',
    isAdmin: true,
  }
  assert.throws(() => new User(JSON.parse(JSON.stringify(invalidUser))), /isAdmin/)

  const userIndexes = await User.collection.indexes()
  assert.ok(userIndexes.some((index) => index.name === 'uniq_user_email' && index.unique))

  const sessionIndexes = await Session.collection.indexes()
  assert.ok(
    sessionIndexes.some(
      (index) => index.name === 'ttl_session_expiry' && index.expireAfterSeconds === 0,
    ),
  )
  assert.ok(sessionIndexes.some((index) => index.name === 'session_user_active_expiry'))
})

test('CSRF token is bound to the session and its server secret', () => {
  const token = 'B'.repeat(43)
  const csrf = createCsrfToken(token, sessionSecret)
  assert.equal(typeof csrf, 'string')
  assert.equal(csrf.length, 43)
  assert.equal(verifyCsrfToken(csrf, token, sessionSecret), true)
  assert.equal(verifyCsrfToken(csrf, `C${token.slice(1)}`, sessionSecret), false)
  assert.equal(verifyCsrfToken(csrf, token, `${sessionSecret}-different`), false)
})
