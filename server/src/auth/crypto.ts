import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
const HASH_BYTES = 64
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const DUMMY_SALT = randomBytes(16).toString('hex')
const DUMMY_HASH = scryptSync(randomBytes(32), DUMMY_SALT, HASH_BYTES).toString('hex')

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, HASH_BYTES, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await derivePassword(password, salt)).toString('hex')
  return { hash, salt }
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    if (!/^[a-f0-9]{128}$/.test(hash) || !/^[a-f0-9]{32}$/.test(salt)) {
      await derivePassword(password, DUMMY_SALT)
      return false
    }
    const computed = await derivePassword(password, salt)
    return timingSafeEqual(Buffer.from(hash, 'hex'), computed)
  } catch {
    return false
  }
}

export async function verifyUnknownUserPassword(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH, DUMMY_SALT)
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(`session:${token}`).digest('hex')
}

export function createCsrfToken(sessionToken: string, secret: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionToken}`).digest('base64url')
}

export function verifyCsrfToken(
  submittedToken: string | undefined,
  sessionToken: string,
  secret: string,
): boolean {
  if (!submittedToken || !/^[A-Za-z0-9_-]{43}$/.test(submittedToken)) return false
  const expected = Buffer.from(createCsrfToken(sessionToken, secret), 'base64url')
  const submitted = Buffer.from(submittedToken, 'base64url')
  return submitted.length === expected.length && timingSafeEqual(submitted, expected)
}

export function sessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS)
}

export function sessionMaxAgeSeconds(): number {
  return SESSION_TTL_MS / 1000
}
