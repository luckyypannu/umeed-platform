import { createHash } from 'node:crypto'
import mongoose, { Types, type ClientSession } from 'mongoose'
import { z } from 'zod'
import { AuditEvent } from '../models/audit-event.js'
import { Notification } from '../models/private-features.js'
import { SupportRequest } from '../models/support-request.js'
import { User, userRoles, userStatuses } from '../models/user.js'
import {
  applicantStatuses,
  opportunityModes,
  opportunityStatuses,
  VolunteerOpportunity,
} from '../models/volunteer-opportunity.js'

const dateString = z.string().min(1).refine((value) => Number.isFinite(Date.parse(value)))
const legacyUserSchema = z.object({
  id: z.string().trim().min(1).max(160),
  email: z.string().trim().min(3).max(254),
  passwordHash: z.string(),
  salt: z.string(),
  role: z.string(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().max(32).optional(),
  city: z.string().max(120).optional(),
  locality: z.string().max(120).optional(),
  address: z.string().max(500).optional(),
  orgName: z.string().max(160).optional(),
  contactPerson: z.string().max(120).optional(),
  regNumber: z.string().max(80).optional(),
  operatingCity: z.string().max(120).optional(),
  areasOfSupport: z.array(z.string().max(80)).max(30).optional(),
  skills: z.string().max(1000).optional(),
  interests: z.string().max(1000).optional(),
  availableDays: z.string().max(200).optional(),
  motivation: z.string().max(2000).optional(),
  status: z.string(),
  createdAt: dateString,
  updatedAt: dateString.optional(),
}).passthrough()

const legacyRequestSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  city: z.string().trim().min(1).max(120),
  locality: z.string().max(120).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['submitted', 'under_review', 'in_progress', 'resolved', 'cancelled']),
  seekerId: z.string().trim().min(1).max(160),
  seekerName: z.string().max(120),
  seekerPhone: z.string().max(32).optional(),
  assignedNgoId: z.string().max(160).optional(),
  assignedVolunteerId: z.string().max(160).optional(),
  notes: z.array(z.string().max(500)).max(100).optional(),
  createdAt: dateString,
  updatedAt: dateString.optional(),
}).passthrough()

const legacyApplicantSchema = z.object({
  volunteerId: z.string().trim().min(1).max(160),
  status: z.enum(applicantStatuses),
  appliedAt: dateString,
}).passthrough()

const legacyOpportunitySchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(100),
  mode: z.enum(opportunityModes),
  city: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
  status: z.enum(opportunityStatuses),
  applicants: z.array(legacyApplicantSchema).max(1000).optional(),
  createdAt: dateString,
}).passthrough()

const legacyEmergencySchema = z.object({
  id: z.string().trim().min(1).max(160),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).optional(),
  status: z.enum(['active', 'dispatched', 'resolved']),
  createdAt: dateString,
}).passthrough()

const legacyChatSchema = z.object({
  id: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
  sender: z.enum(['user', 'assistant']),
  text: z.string().max(2000),
  timestamp: dateString,
}).passthrough()

const legacyNotificationSchema = z.object({
  id: z.string().trim().min(1).max(160),
  userId: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(500),
  type: z.enum(['info', 'success', 'alert']),
  link: z.string().max(300).optional(),
  read: z.boolean(),
  createdAt: dateString,
}).passthrough()

const collections = [
  'users',
  'requests',
  'opportunities',
  'emergencyAlerts',
  'chatMessages',
  'notifications',
] as const
type CollectionName = (typeof collections)[number]
type LegacyUser = z.infer<typeof legacyUserSchema>
type LegacyRequest = z.infer<typeof legacyRequestSchema>
type LegacyOpportunity = z.infer<typeof legacyOpportunitySchema>
type LegacyNotification = z.infer<typeof legacyNotificationSchema>

export interface LegacySnapshot {
  users: unknown[]
  requests: unknown[]
  opportunities: unknown[]
  emergencyAlerts: unknown[]
  chatMessages: unknown[]
  notifications: unknown[]
}

export interface MigrationPlan {
  sourceSha256: string
  sourceCounts: Record<CollectionName, number>
  importCounts: {
    users: number
    requests: number
    opportunities: number
    notifications: number
  }
  rejectedByCategory: Record<string, number>
  blockingIssueCount: number
  internal: {
    users: Array<{ source: LegacyUser; digest: string }>
    requests: Array<{ source: LegacyRequest; digest: string }>
    opportunities: Array<{ source: LegacyOpportunity; digest: string }>
    notifications: Array<{ source: LegacyNotification; digest: string }>
  }
}

export class MigrationInputError extends Error {
  constructor(readonly category: 'invalid_json' | 'invalid_structure') {
    super('Migration input is invalid')
    this.name = 'MigrationInputError'
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function emptyCounts(): Record<CollectionName, number> {
  return {
    users: 0,
    requests: 0,
    opportunities: 0,
    emergencyAlerts: 0,
    chatMessages: 0,
    notifications: 0,
  }
}

function addCount(target: Record<string, number>, category: string, count = 1): void {
  target[category] = (target[category] ?? 0) + count
}

function isSeedAccount(user: LegacyUser): boolean {
  return /^usr-(seeker|ngo|volunteer|admin)-\d+$/i.test(user.id)
}

function roleIs(value: string, role: string): boolean {
  return userRoles.includes(value as (typeof userRoles)[number]) && value === role
}

function parseRecords<T>(
  records: unknown[],
  schema: z.ZodType<T>,
  rejected: Record<string, number>,
): Array<{ source: T; raw: unknown }> {
  const parsed: Array<{ source: T; raw: unknown }> = []
  for (const raw of records) {
    const result = schema.safeParse(raw)
    if (!result.success) {
      addCount(rejected, 'invalid_records')
      continue
    }
    parsed.push({ source: result.data, raw })
  }
  return parsed
}

function duplicateIds<T>(
  values: Array<{ source: T; raw: unknown }>,
  getId: (source: T) => string,
): Set<string> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(getId(value.source), (counts.get(getId(value.source)) ?? 0) + 1)
  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id))
}

function duplicateEmailIds(users: Array<{ source: LegacyUser; raw: unknown }>): Set<string> {
  const groups = new Map<string, string[]>()
  for (const { source } of users) {
    const normalizedEmail = source.email.trim().toLowerCase()
    groups.set(normalizedEmail, [...(groups.get(normalizedEmail) ?? []), source.id])
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat())
}

export function parseLegacySnapshot(input: unknown): LegacySnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new MigrationInputError('invalid_structure')
  }
  const record = input as Record<string, unknown>
  if (Object.keys(record).some((key) => !collections.includes(key as CollectionName))) {
    throw new MigrationInputError('invalid_structure')
  }
  const snapshot = {} as LegacySnapshot
  for (const collection of collections) {
    if (!Array.isArray(record[collection])) {
      throw new MigrationInputError('invalid_structure')
    }
    snapshot[collection] = record[collection]
  }
  return snapshot
}

export function buildMigrationPlan(
  snapshot: LegacySnapshot,
  sourceSha256 = digest(snapshot),
): MigrationPlan {
  const sourceCounts = emptyCounts()
  for (const collection of collections) sourceCounts[collection] = snapshot[collection].length
  const rejected: Record<string, number> = {}

  const users = parseRecords(snapshot.users, legacyUserSchema, rejected)
  const requestRecords = parseRecords(snapshot.requests, legacyRequestSchema, rejected)
  const opportunityRecords = parseRecords(snapshot.opportunities, legacyOpportunitySchema, rejected)
  const emergencyRecords = parseRecords(snapshot.emergencyAlerts, legacyEmergencySchema, rejected)
  const chatRecords = parseRecords(snapshot.chatMessages, legacyChatSchema, rejected)
  const notificationRecords = parseRecords(snapshot.notifications, legacyNotificationSchema, rejected)

  const userIds = duplicateIds(users, (user) => user.id)
  const requestIds = duplicateIds(requestRecords, (item) => item.id)
  const opportunityIds = duplicateIds(opportunityRecords, (item) => item.id)
  const notificationIds = duplicateIds(notificationRecords, (item) => item.id)
  const duplicateUsers = duplicateEmailIds(users)
  addCount(rejected, 'duplicate_ids', userIds.size + requestIds.size + opportunityIds.size + notificationIds.size)
  addCount(rejected, 'duplicate_email_users', duplicateUsers.size)

  const sourceUserById = new Map(users.map(({ source }) => [source.id, source]))
  const importableUsers = new Map<string, { source: LegacyUser; digest: string }>()
  for (const { source, raw } of users) {
    if (userIds.has(source.id)) continue
    if (duplicateUsers.has(source.id)) continue
    if (!userRoles.includes(source.role as (typeof userRoles)[number])) {
      addCount(rejected, 'invalid_roles')
      continue
    }
    if (!userStatuses.includes(source.status as (typeof userStatuses)[number])) {
      addCount(rejected, 'invalid_statuses')
      continue
    }
    if (source.role === 'admin') {
      addCount(rejected, 'admin_accounts_excluded')
      continue
    }
    if (isSeedAccount(source)) {
      addCount(rejected, 'seed_accounts_pending_review')
      continue
    }
    if (!/^[a-f0-9]{128}$/i.test(source.passwordHash) || !/^[a-f0-9]{32}$/i.test(source.salt)) {
      addCount(rejected, 'incompatible_password_hashes')
      continue
    }
    const normalizedEmail = source.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      addCount(rejected, 'invalid_records')
      continue
    }
    const entry = { source, digest: digest(raw) }
    importableUsers.set(source.id, entry)
  }

  const importedUsers = new Map(importableUsers)
  const importedRequests: MigrationPlan['internal']['requests'] = []
  for (const { source, raw } of requestRecords) {
    if (requestIds.has(source.id)) continue
    const seeker = sourceUserById.get(source.seekerId)
    if (!seeker || !roleIs(seeker.role, 'seeker')) {
      addCount(rejected, 'invalid_references')
      continue
    }
    if (!importedUsers.has(source.seekerId)) {
      addCount(rejected, 'dependent_records_excluded')
      continue
    }
    let validAssignments = true
    for (const [assignedId, role] of [
      [source.assignedNgoId, 'ngo'],
      [source.assignedVolunteerId, 'volunteer'],
    ] as const) {
      if (!assignedId) continue
      const assigned = sourceUserById.get(assignedId)
      if (!assigned || !roleIs(assigned.role, role) || assigned.status !== 'verified') {
        addCount(rejected, 'invalid_references')
        validAssignments = false
        break
      }
      if (!importedUsers.has(assignedId)) {
        addCount(rejected, 'dependent_records_excluded')
        validAssignments = false
        break
      }
    }
    if (!validAssignments) continue
    importedRequests.push({ source, digest: digest(raw) })
  }

  const importedOpportunities: MigrationPlan['internal']['opportunities'] = []
  for (const { source, raw } of opportunityRecords) {
    if (opportunityIds.has(source.id)) continue
    const applicants = source.applicants ?? []
    let validApplicants = true
    for (const applicant of applicants) {
      const user = sourceUserById.get(applicant.volunteerId)
      if (!user || !roleIs(user.role, 'volunteer') || user.status !== 'verified') {
        addCount(rejected, 'invalid_references')
        validApplicants = false
        break
      }
      if (!importedUsers.has(applicant.volunteerId)) {
        addCount(rejected, 'dependent_records_excluded')
        validApplicants = false
        break
      }
    }
    if (validApplicants) importedOpportunities.push({ source, digest: digest(raw) })
  }

  const importedNotifications: MigrationPlan['internal']['notifications'] = []
  for (const { source, raw } of notificationRecords) {
    if (notificationIds.has(source.id)) continue
    if (!sourceUserById.has(source.userId)) {
      addCount(rejected, 'invalid_references')
      continue
    }
    if (!importedUsers.has(source.userId)) {
      addCount(rejected, 'dependent_records_excluded')
      continue
    }
    importedNotifications.push({ source, digest: digest(raw) })
  }

  addCount(rejected, 'emergency_records_unowned_or_unconsented', emergencyRecords.length)
  addCount(rejected, 'chat_messages_unowned_or_shared', chatRecords.length)

  const blockingIssueCount =
    (rejected.invalid_records ?? 0) +
    (rejected.invalid_roles ?? 0) +
    (rejected.invalid_statuses ?? 0) +
    (rejected.invalid_references ?? 0) +
    (rejected.duplicate_ids ?? 0) +
    (rejected.duplicate_email_users ?? 0) +
    (rejected.incompatible_password_hashes ?? 0)

  return {
    sourceSha256,
    sourceCounts,
    importCounts: {
      users: importedUsers.size,
      requests: importedRequests.length,
      opportunities: importedOpportunities.length,
      notifications: importedNotifications.length,
    },
    rejectedByCategory: Object.fromEntries(
      Object.entries(rejected).sort(([left], [right]) => left.localeCompare(right)),
    ),
    blockingIssueCount,
    internal: {
      users: [...importedUsers.values()],
      requests: importedRequests,
      opportunities: importedOpportunities,
      notifications: importedNotifications,
    },
  }
}

function compareExisting(
  existing: { legacyId?: string | null; legacyDigest?: string | null } | null,
  sourceId: string,
  sourceDigest: string,
): 'insert' | 'same' | 'conflict' {
  if (!existing) return 'insert'
  if (existing.legacyId === sourceId && existing.legacyDigest === sourceDigest) return 'same'
  return 'conflict'
}

function preservedObjectId(sourceId: string): Types.ObjectId | undefined {
  if (!/^[a-f\d]{24}$/i.test(sourceId)) return undefined
  const objectId = new Types.ObjectId(sourceId)
  return objectId.toString() === sourceId.toLowerCase() ? objectId : undefined
}

async function insertUser(
  source: LegacyUser,
  sourceDigest: string,
  transaction: ClientSession,
): Promise<'inserted' | 'same' | 'conflict'> {
  const byLegacyId = await User.findOne({ legacyId: source.id }).session(transaction)
  if (byLegacyId) {
    return compareExisting(byLegacyId, source.id, sourceDigest) === 'same' ? 'same' : 'conflict'
  }
  const email = source.email.trim().toLowerCase()
  if (await User.exists({ email }).session(transaction)) return 'conflict'
  await User.create([{
    ...(preservedObjectId(source.id) ? { _id: preservedObjectId(source.id) } : {}),
    legacyId: source.id,
    legacyDigest: sourceDigest,
    email,
    passwordHash: source.passwordHash.toLowerCase(),
    salt: source.salt.toLowerCase(),
    role: source.role,
    name: source.name,
    phone: source.phone ?? '',
    city: source.city ?? '',
    locality: source.locality ?? '',
    address: source.address ?? '',
    orgName: source.orgName ?? '',
    contactPerson: source.contactPerson ?? '',
    regNumber: source.regNumber ?? '',
    operatingCity: source.operatingCity ?? '',
    areasOfSupport: source.areasOfSupport ?? [],
    skills: source.skills ?? '',
    interests: source.interests ?? '',
    availableDays: source.availableDays ?? '',
    motivation: source.motivation ?? '',
    status: source.status,
    createdAt: new Date(source.createdAt),
    ...(source.updatedAt ? { updatedAt: new Date(source.updatedAt) } : {}),
  }], { session: transaction })
  return 'inserted'
}

export interface MigrationApplyResult {
  inserted: { users: number; requests: number; opportunities: number; notifications: number }
  unchanged: { users: number; requests: number; opportunities: number; notifications: number }
}

export async function applyMigrationPlan(plan: MigrationPlan): Promise<MigrationApplyResult> {
  if (plan.blockingIssueCount > 0) {
    throw new Error('Migration plan contains blocking validation issues')
  }
  const inserted = { users: 0, requests: 0, opportunities: 0, notifications: 0 }
  const unchanged = { users: 0, requests: 0, opportunities: 0, notifications: 0 }
  const transaction = await mongoose.startSession()
  try {
    await transaction.withTransaction(async () => {
      Object.assign(inserted, { users: 0, requests: 0, opportunities: 0, notifications: 0 })
      Object.assign(unchanged, { users: 0, requests: 0, opportunities: 0, notifications: 0 })
      for (const { source, digest: sourceDigest } of plan.internal.users) {
        const result = await insertUser(source, sourceDigest, transaction)
        if (result === 'conflict') throw new Error('Migration conflict detected')
        if (result === 'same') unchanged.users += 1
        else inserted.users += 1
      }

      const userIds = new Map<string, Types.ObjectId>()
      const importedLegacyIds = plan.internal.users.map(({ source }) => source.id)
      const mappedUsers = importedLegacyIds.length
        ? await User.find({ legacyId: { $in: importedLegacyIds } })
            .select('_id legacyId')
            .session(transaction)
            .lean()
        : []
      for (const user of mappedUsers) {
        if (user.legacyId) userIds.set(user.legacyId, user._id)
      }

      for (const { source, digest: sourceDigest } of plan.internal.requests) {
        const existing = await SupportRequest.findOne({ legacyId: source.id }).session(transaction)
        const prior = compareExisting(existing, source.id, sourceDigest)
        if (prior === 'conflict') throw new Error('Migration conflict detected')
        if (prior === 'same') {
          unchanged.requests += 1
          continue
        }
        const seekerId = userIds.get(source.seekerId)
        const assignedNgoId = source.assignedNgoId ? userIds.get(source.assignedNgoId) : null
        const assignedVolunteerId = source.assignedVolunteerId
          ? userIds.get(source.assignedVolunteerId)
          : null
        if (!seekerId || (source.assignedNgoId && !assignedNgoId) ||
            (source.assignedVolunteerId && !assignedVolunteerId)) {
          throw new Error('Migration reference conflict detected')
        }
        await SupportRequest.create([{
          ...(preservedObjectId(source.id) ? { _id: preservedObjectId(source.id) } : {}),
          legacyId: source.id,
          legacyDigest: sourceDigest,
          title: source.title,
          category: source.category,
          description: source.description,
          city: source.city,
          locality: source.locality ?? '',
          urgency: source.urgency,
          status: source.status,
          seekerId,
          seekerName: source.seekerName,
          seekerPhone: source.seekerPhone ?? '',
          assignedNgoId,
          assignedVolunteerId,
          notes: source.notes ?? ['Request submitted for review.'],
          createdAt: new Date(source.createdAt),
          ...(source.updatedAt ? { updatedAt: new Date(source.updatedAt) } : {}),
        }], { session: transaction })
        inserted.requests += 1
      }

      for (const { source, digest: sourceDigest } of plan.internal.opportunities) {
        const existing = await VolunteerOpportunity.findOne({ legacyId: source.id }).session(transaction)
        const prior = compareExisting(existing, source.id, sourceDigest)
        if (prior === 'conflict') throw new Error('Migration conflict detected')
        if (prior === 'same') {
          unchanged.opportunities += 1
          continue
        }
        const applicants = (source.applicants ?? []).map((applicant) => {
          const volunteerId = userIds.get(applicant.volunteerId)
          if (!volunteerId) throw new Error('Migration reference conflict detected')
          return {
            volunteerId,
            status: applicant.status,
            appliedAt: new Date(applicant.appliedAt),
          }
        })
        await VolunteerOpportunity.create([{
          ...(preservedObjectId(source.id) ? { _id: preservedObjectId(source.id) } : {}),
          legacyId: source.id,
          legacyDigest: sourceDigest,
          title: source.title,
          category: source.category,
          mode: source.mode,
          city: source.city,
          description: source.description,
          status: source.status,
          applicants,
          createdAt: new Date(source.createdAt),
        }], { session: transaction })
        inserted.opportunities += 1
      }

      for (const { source, digest: sourceDigest } of plan.internal.notifications) {
        const existing = await Notification.findOne({ legacyId: source.id }).session(transaction)
        const prior = compareExisting(existing, source.id, sourceDigest)
        if (prior === 'conflict') throw new Error('Migration conflict detected')
        if (prior === 'same') {
          unchanged.notifications += 1
          continue
        }
        const recipientId = userIds.get(source.userId)
        if (!recipientId) throw new Error('Migration reference conflict detected')
        await Notification.create([{
          ...(preservedObjectId(source.id) ? { _id: preservedObjectId(source.id) } : {}),
          legacyId: source.id,
          legacyDigest: sourceDigest,
          recipientId,
          message: 'You have a previous update from UMEED.',
          type: source.type,
          link: source.link ?? '',
          read: source.read,
          createdAt: new Date(source.createdAt),
        }], { session: transaction })
        inserted.notifications += 1
      }
    })
  } catch {
    throw new Error('Migration transaction aborted; no records were committed')
  } finally {
    await transaction.endSession()
  }
  return { inserted, unchanged }
}

export async function countTargetDocuments(): Promise<{
  users: number
  requests: number
  opportunities: number
  notifications: number
}> {
  const [users, requests, opportunities, notifications] = await Promise.all([
    User.countDocuments(),
    SupportRequest.countDocuments(),
    VolunteerOpportunity.countDocuments(),
    Notification.countDocuments(),
  ])
  return { users, requests, opportunities, notifications }
}
