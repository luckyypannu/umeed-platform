import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { proxyResponseBody } from '../lib/server/proxy-response.ts'
import { createToken, verifyToken } from '../lib/server/crypto.ts'
import { isPublicRegistrationRole } from '../lib/server/registration-policy.ts'

const originalJwtSecret = process.env.JWT_SECRET

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET
  } else {
    process.env.JWT_SECRET = originalJwtSecret
  }
})

test('public registration accepts only seeker, NGO, and volunteer roles', () => {
  assert.equal(isPublicRegistrationRole('seeker'), true)
  assert.equal(isPublicRegistrationRole('ngo'), true)
  assert.equal(isPublicRegistrationRole('volunteer'), true)
  assert.equal(isPublicRegistrationRole('admin'), false)
  assert.equal(isPublicRegistrationRole(null), false)
  assert.equal(isPublicRegistrationRole({ role: 'admin' }), false)
})

test('token operations fail closed when JWT_SECRET is missing or too short', () => {
  delete process.env.JWT_SECRET
  assert.throws(() => createToken({ userId: 'test' }), /JWT_SECRET/)
  assert.equal(verifyToken('invalid.token.signature'), null)

  process.env.JWT_SECRET = 'too-short'
  assert.throws(() => createToken({ userId: 'test' }), /JWT_SECRET/)
})

test('tokens can be signed and verified with a configured secret', () => {
  process.env.JWT_SECRET = 'a'.repeat(64)
  const token = createToken({ userId: 'test-user' })
  assert.deepEqual(verifyToken<{ userId: string }>(token)?.userId, 'test-user')
})

test('API proxy omits bodies for no-content response statuses', () => {
  const body = new ArrayBuffer(0)
  assert.equal(proxyResponseBody(204, body), null)
  assert.equal(proxyResponseBody(205, body), null)
  assert.equal(proxyResponseBody(304, body), null)
  assert.equal(proxyResponseBody(200, body), body)
})

test('all Next.js API handlers proxy to Express and none imports the legacy database layer', async () => {
  const routeFiles: string[] = []
  async function collectRoutes(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await collectRoutes(entryPath)
      else if (entry.name === 'route.ts') routeFiles.push(entryPath)
    }
  }

  await collectRoutes(path.join(process.cwd(), 'app', 'api'))
  assert.ok(routeFiles.length > 0)
  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, 'utf8')
    assert.doesNotMatch(source, /lib\/server\/db/)
    assert.match(source, /proxyApiRequest|proxyAuthRequest/)
  }
})
