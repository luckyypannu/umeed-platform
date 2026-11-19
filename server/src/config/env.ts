import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().refine((value) => {
    try {
      const uri = new URL(value)
      return (
        ['mongodb:', 'mongodb+srv:'].includes(uri.protocol) &&
        uri.hostname.length > 0
      )
    } catch {
      return false
    }
  }, 'must be a valid mongodb:// or mongodb+srv:// URI'),
  MONGODB_DB_NAME: z.string().trim().min(1),
  SESSION_SECRET: z.string().refine(
    (secret) => Buffer.byteLength(secret, 'utf8') >= 32,
    'must contain at least 32 bytes',
  ),
  JWT_SECRET: z.string().refine(
    (secret) => Buffer.byteLength(secret, 'utf8') >= 32,
    'must contain at least 32 bytes',
  ),
  FRONTEND_ORIGIN: z.string().url().refine((origin) => {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === origin
  }, 'must be an exact HTTP or HTTPS origin without a path'),
  LOCAL_STAGING_ORIGINS: z.string().optional().refine((origins) => {
    if (origins === undefined) return true
    const allowedLocalOrigins = new Set([
      'http://localhost:3100',
      'http://127.0.0.1:3100',
    ])
    const values = origins.split(',').map((origin) => origin.trim())
    return values.length > 0 &&
      values.every((origin) => allowedLocalOrigins.has(origin)) &&
      new Set(values).size === values.length
  }, 'may contain only unique localhost:3100 or 127.0.0.1:3100 origins'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(300),
})

export type ServerConfig = z.infer<typeof environmentSchema>

export function allowedFrontendOrigins(
  config: Pick<ServerConfig, 'FRONTEND_ORIGIN' | 'LOCAL_STAGING_ORIGINS'>,
): string[] {
  return [
    config.FRONTEND_ORIGIN,
    ...(config.LOCAL_STAGING_ORIGINS?.split(',').map((origin) => origin.trim()) ?? []),
  ]
}

function mongoTlsEnabled(uriValue: string): boolean {
  const uri = new URL(uriValue)
  const options = [...uri.searchParams.entries()].reduce<Record<string, string[]>>(
    (result, [key, value]) => {
      const normalizedKey = key.toLowerCase()
      if (normalizedKey === 'tls' || normalizedKey === 'ssl') {
        result[normalizedKey] ??= []
        result[normalizedKey].push(value.toLowerCase())
      }
      return result
    },
    {},
  )
  const values = [...(options.tls ?? []), ...(options.ssl ?? [])]
  if (values.some((value) => value !== 'true')) return false
  return uri.protocol === 'mongodb+srv:' || values.includes('true')
}

export function parseEnvironment(environment: NodeJS.ProcessEnv): ServerConfig {
  const parsed = environmentSchema.safeParse(environment)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid server environment: ${details}`)
  }
  if (parsed.data.NODE_ENV === 'production' && new URL(parsed.data.FRONTEND_ORIGIN).protocol !== 'https:') {
    throw new Error('Invalid server environment: FRONTEND_ORIGIN must use HTTPS in production')
  }
  if (parsed.data.LOCAL_STAGING_ORIGINS && parsed.data.NODE_ENV !== 'development') {
    throw new Error('Invalid server environment: LOCAL_STAGING_ORIGINS is allowed only in development')
  }
  if (parsed.data.NODE_ENV === 'production' && !mongoTlsEnabled(parsed.data.MONGODB_URI)) {
    throw new Error('Invalid server environment: MONGODB_URI must enable TLS in production')
  }
  return parsed.data
}
