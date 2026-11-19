import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose'

export interface SessionFields {
  tokenHash: string
  userId: Types.ObjectId
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const sessionSchema = new Schema<SessionFields>(
  {
    tokenHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    strict: 'throw',
    versionKey: false,
  },
)

sessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'uniq_session_token_hash' })
sessionSchema.index(
  { userId: 1, revokedAt: 1, expiresAt: 1 },
  { name: 'session_user_active_expiry' },
)
sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_session_expiry' },
)

export type SessionDocument = HydratedDocument<SessionFields>
export const Session = mongoose.models.Session ?? mongoose.model<SessionFields>('Session', sessionSchema)
