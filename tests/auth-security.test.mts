import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { proxyResponseBody } from '../lib/server/proxy-response.ts'
import { isPublicRegistrationRole } from '../lib/server/registration-policy.ts'

test('public registration accepts only seeker, NGO, and volunteer roles', () => {
  assert.equal(isPublicRegistrationRole('seeker'), true)
  assert.equal(isPublicRegistrationRole('ngo'), true)
  assert.equal(isPublicRegistrationRole('volunteer'), true)
  assert.equal(isPublicRegistrationRole('admin'), false)
  assert.equal(isPublicRegistrationRole(null), false)
  assert.equal(isPublicRegistrationRole({ role: 'admin' }), false)
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
