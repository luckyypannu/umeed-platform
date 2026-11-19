import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'
import {
  applyMigrationPlan,
  buildMigrationPlan,
  countTargetDocuments,
  parseLegacySnapshot,
} from '../src/migration/legacy-json.js'
import { AuditEvent } from '../src/models/audit-event.js'
import { ChatSession, EmergencyRecord, Notification } from '../src/models/private-features.js'
import { SupportRequest } from '../src/models/support-request.js'
import { User } from '../src/models/user.js'
import { VolunteerOpportunity } from '../src/models/volunteer-opportunity.js'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const protectedSource = path.resolve(repositoryRoot, 'data', 'db.json')

interface Arguments {
  sourcePath: string
  apply: boolean
  expectedSha256: string
  confirmNonProduction: boolean
}

function parseArguments(values: string[]): Arguments {
  let sourcePath = ''
  let apply = false
  let expectedSha256 = ''
  let confirmNonProduction = false
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--source') {
      sourcePath = values[index + 1] ?? ''
      index += 1
    } else if (value === '--apply') {
      apply = true
    } else if (value === '--expected-sha256') {
      expectedSha256 = values[index + 1] ?? ''
      index += 1
    } else if (value === '--confirm-nonproduction') {
      confirmNonProduction = true
    } else {
      throw new Error('Invalid migration arguments')
    }
  }
  if (!sourcePath) throw new Error('Migration source is required')
  if (apply && (!/^[a-f0-9]{64}$/i.test(expectedSha256) || !confirmNonProduction)) {
    throw new Error('Apply requires a verified source digest and non-production confirmation')
  }
  return {
    sourcePath: path.resolve(sourcePath),
    apply,
    expectedSha256,
    confirmNonProduction,
  }
}

async function loadPlan(sourcePath: string) {
  if (sourcePath === protectedSource) {
    throw new Error('The active JSON database cannot be used as a migration source')
  }
  const fileInfo = await stat(sourcePath)
  if (!fileInfo.isFile() || fileInfo.size > 50 * 1024 * 1024) {
    throw new Error('Migration source file is invalid')
  }
  const bytes = await readFile(sourcePath)
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex')
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('Migration source is not valid JSON')
  }
  const snapshot = parseLegacySnapshot(parsed)
  return { sourceSha256, plan: buildMigrationPlan(snapshot, sourceSha256) }
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2))
  const { sourceSha256, plan } = await loadPlan(args.sourcePath)
  if (args.apply && sourceSha256.toLowerCase() !== args.expectedSha256.toLowerCase()) {
    throw new Error('Migration source digest does not match the operator-verified backup')
  }
  if (args.apply) {
    if (process.env.MIGRATION_TARGET !== 'non-production') {
      throw new Error('Migration apply requires MIGRATION_TARGET=non-production')
    }
    const config = parseEnvironment(process.env)
    if (!/(?:_migration|_staging|_test|_dev)$/i.test(config.MONGODB_DB_NAME)) {
      throw new Error('Migration target database name must end in a non-production suffix')
    }
    await connectDatabase(config)
    try {
      await Promise.all([
        AuditEvent.createIndexes(),
        ChatSession.createIndexes(),
        EmergencyRecord.createIndexes(),
        Notification.createIndexes(),
        SupportRequest.createIndexes(),
        User.createIndexes(),
        VolunteerOpportunity.createIndexes(),
      ])
      const targetBefore = await countTargetDocuments()
      const result = await applyMigrationPlan(plan)
      const targetAfter = await countTargetDocuments()
      process.stdout.write(`${JSON.stringify({
        mode: 'apply',
        sourceSha256,
        sourceCounts: plan.sourceCounts,
        importCounts: plan.importCounts,
        rejectedByCategory: plan.rejectedByCategory,
        inserted: result.inserted,
        unchanged: result.unchanged,
        targetBefore,
        targetAfter,
      })}\n`)
    } finally {
      await disconnectDatabase()
    }
    return
  }

  process.stdout.write(`${JSON.stringify({
    mode: 'dry-run',
    sourceSha256,
    sourceCounts: plan.sourceCounts,
    importCounts: plan.importCounts,
    rejectedByCategory: plan.rejectedByCategory,
    blockingIssueCount: plan.blockingIssueCount,
    targetCounts: 'not queried; no target database was connected',
  })}\n`)
}

void main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError'
  process.stderr.write(`${JSON.stringify({ error: 'Migration stopped safely', errorName: name })}\n`)
  process.exitCode = 1
})
