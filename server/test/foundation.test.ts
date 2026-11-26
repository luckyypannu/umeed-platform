import assert from 'node:assert/strict'
import { test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { parseEnvironment } from '../src/config/env.js'

function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return parseEnvironment({
    NODE_ENV: 'test',
    PORT: '4000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    MONGODB_DB_NAME: 'umeed_test',
    SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
    FRONTEND_ORIGIN: 'http://localhost:3000',
    TRUST_PROXY: '0',
    LOG_LEVEL: 'silent',
    API_RATE_LIMIT_MAX: '300',
    ...overrides,
  })
}

test('environment validation rejects missing session secrets and invalid MongoDB URIs', () => {
  assert.throws(
    () => parseEnvironment({ MONGODB_URI: 'mongodb://localhost:27017', MONGODB_DB_NAME: 'umeed', SESSION_SECRET: 'short', FRONTEND_ORIGIN: 'http://localhost:3000' }),
    /SESSION_SECRET/,
  )
  assert.throws(
    () => parseEnvironment({ MONGODB_URI: 'http://localhost:27017', MONGODB_DB_NAME: 'umeed', SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes', FRONTEND_ORIGIN: 'http://localhost:3000' }),
    /MONGODB_URI/,
  )
  assert.throws(
    () => parseEnvironment({ MONGODB_URI: 'mongodb://localhost:27017', MONGODB_DB_NAME: 'umeed', SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes', FRONTEND_ORIGIN: 'http://localhost:3000/path' }),
    /FRONTEND_ORIGIN/,
  )
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017',
      MONGODB_DB_NAME: 'umeed',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
      FRONTEND_ORIGIN: 'http://umeed.example',
    }),
    /HTTPS in production/,
  )
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://mongo.example:27017/umeed',
      MONGODB_DB_NAME: 'umeed',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
      FRONTEND_ORIGIN: 'https://umeed.example',
    }),
    /MONGODB_URI must enable TLS/,
  )
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://mongo.example/umeed?tls=false',
      MONGODB_DB_NAME: 'umeed',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
      FRONTEND_ORIGIN: 'https://umeed.example',
    }),
    /MONGODB_URI must enable TLS/,
  )
  assert.doesNotThrow(() => parseEnvironment({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://mongo.example:27017/umeed?tls=true',
    MONGODB_DB_NAME: 'umeed',
    SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
    FRONTEND_ORIGIN: 'https://umeed.example',
  }))
  assert.doesNotThrow(() => parseEnvironment({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://mongo.example/umeed',
    MONGODB_DB_NAME: 'umeed',
    SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
    FRONTEND_ORIGIN: 'https://umeed.example',
  }))
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://mongo.example/umeed',
      MONGODB_DB_NAME: 'umeed',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
      FRONTEND_ORIGIN: 'https://umeed.example',
      LOCAL_STAGING_ORIGINS: 'http://localhost:3100',
    }),
    /LOCAL_STAGING_ORIGINS is allowed only in development/,
  )
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://localhost:27017',
      MONGODB_DB_NAME: 'umeed',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes',
      FRONTEND_ORIGIN: 'http://localhost:3100',
      LOCAL_STAGING_ORIGINS: 'https://attacker.example',
    }),
    /LOCAL_STAGING_ORIGINS/,
  )
})

test('liveness and readiness endpoints report process and database states', async () => {
  const app = createApp(testConfig())
  const live = await request(app).get('/api/v1/health/live')
  assert.equal(live.status, 200)
  assert.deepEqual(live.body, { status: 'ok' })

  const ready = await request(app).get('/api/v1/health/ready')
  assert.equal(ready.status, 503)
  assert.deepEqual(ready.body, { status: 'not_ready', checks: { database: 'not_ready' } })
})

test('API responses include request IDs and security headers and enforce configured CORS', async () => {
  const response = await request(createApp(testConfig()))
    .get('/api/v1/health/live')
    .set('Origin', 'http://localhost:3000')

  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i)
  assert.equal(response.headers['x-powered-by'], undefined)
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3000')
  assert.equal(response.headers['access-control-allow-credentials'], 'true')
})

test('local staging permits only the two explicit loopback origins for CORS and authentication', async () => {
  const config = testConfig({
    NODE_ENV: 'development',
    FRONTEND_ORIGIN: 'http://localhost:3100',
    LOCAL_STAGING_ORIGINS: 'http://127.0.0.1:3100',
  })
  const app = createApp(config)

  for (const origin of ['http://localhost:3100', 'http://127.0.0.1:3100']) {
    const corsResponse = await request(app).get('/api/v1/health/live').set('Origin', origin)
    assert.equal(corsResponse.headers['access-control-allow-origin'], origin)

    const registrationResponse = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({})
    assert.equal(registrationResponse.status, 400)
    assert.notEqual(registrationResponse.body.error, 'Request origin is not allowed')
  }

  const hostileCorsResponse = await request(app)
    .get('/api/v1/health/live')
    .set('Origin', 'https://attacker.example')
  assert.equal(hostileCorsResponse.headers['access-control-allow-origin'], undefined)

  const hostileRegistrationResponse = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'https://attacker.example')
    .send({})
  assert.equal(hostileRegistrationResponse.status, 403)
  assert.equal(hostileRegistrationResponse.body.error, 'Request origin is not allowed')
})

test('API rate limit returns 429 when configured limit is exceeded', async () => {
  const app = createApp(testConfig({ API_RATE_LIMIT_MAX: '1' }))
  assert.equal((await request(app).get('/api/v1/health/live')).status, 200)
  assert.equal((await request(app).get('/api/v1/health/live')).status, 429)
})

test('unknown API paths return a JSON 404 with the request ID', async () => {
  const response = await request(createApp(testConfig())).get('/api/v1/not-implemented')
  assert.equal(response.status, 404)
  assert.equal(response.body.error, 'Not found')
  assert.equal(response.body.requestId, response.headers['x-request-id'])
})

test('malformed JSON returns a sanitized client error', async () => {
  const response = await request(createApp(testConfig()))
    .post('/api/v1/not-implemented')
    .set('Content-Type', 'application/json')
    .send('{')

  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'Invalid request')
  assert.equal(response.body.requestId, response.headers['x-request-id'])
})
