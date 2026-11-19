import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose'

export const auditOutcomes = ['succeeded', 'denied', 'conflict'] as const
export type AuditOutcome = (typeof auditOutcomes)[number]

export interface AuditEventFields {
  actorId: Types.ObjectId | null
  actorRole: 'ngo' | 'volunteer' | 'seeker' | 'admin' | 'anonymous'
  action: string
  targetType: 'request' | 'user' | 'emergency' | 'opportunity'
  targetId: string
  outcome: AuditOutcome
  fromStatus: string
  toStatus: string
  details: Record<string, string>
  createdAt: Date
}

const auditEventSchema = new Schema<AuditEventFields>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, required: true, enum: ['ngo', 'volunteer', 'seeker', 'admin', 'anonymous'] },
    action: { type: String, required: true, maxlength: 80 },
    targetType: { type: String, required: true, enum: ['request', 'user', 'emergency', 'opportunity'] },
    targetId: { type: String, required: true, maxlength: 80 },
    outcome: { type: String, required: true, enum: auditOutcomes },
    fromStatus: { type: String, default: '', maxlength: 40 },
    toStatus: { type: String, default: '', maxlength: 40 },
    details: {
      type: Map,
      of: { type: String, maxlength: 120 },
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: 'throw',
    versionKey: false,
  },
)

auditEventSchema.index({ actorId: 1, createdAt: -1 }, { name: 'audit_actor_created' })
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 }, { name: 'audit_target_created' })

export type AuditEventDocument = HydratedDocument<AuditEventFields>
export const AuditEvent =
  mongoose.models.AuditEvent ?? mongoose.model<AuditEventFields>('AuditEvent', auditEventSchema)
