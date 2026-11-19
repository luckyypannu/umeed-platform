import mongoose, { Schema, type HydratedDocument } from 'mongoose'

export const userRoles = ['seeker', 'ngo', 'volunteer', 'admin'] as const
export type UserRole = (typeof userRoles)[number]

export const userStatuses = [
  'active',
  'pending_verification',
  'pending_review',
  'verified',
  'rejected',
] as const
export type UserStatus = (typeof userStatuses)[number]

export interface UserFields {
  email: string
  passwordHash: string
  salt: string
  role: UserRole
  name: string
  phone: string
  city: string
  locality: string
  address: string
  orgName: string
  contactPerson: string
  regNumber: string
  operatingCity: string
  areasOfSupport: string[]
  skills: string
  interests: string
  availableDays: string
  motivation: string
  legacyId?: string
  legacyDigest?: string
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserFields>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true, select: false, match: /^[a-f0-9]{128}$/ },
    salt: { type: String, required: true, select: false, match: /^[a-f0-9]{32}$/ },
    role: { type: String, enum: userRoles, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 32 },
    city: { type: String, default: '', trim: true, maxlength: 120 },
    locality: { type: String, default: '', trim: true, maxlength: 120 },
    address: { type: String, default: '', trim: true, maxlength: 500 },
    orgName: { type: String, default: '', trim: true, maxlength: 160 },
    contactPerson: { type: String, default: '', trim: true, maxlength: 120 },
    regNumber: { type: String, default: '', trim: true, maxlength: 80 },
    operatingCity: { type: String, default: '', trim: true, maxlength: 120 },
    areasOfSupport: {
      type: [String],
      default: [],
      validate: (values: string[]) =>
        values.length <= 30 && values.every((value) => value.trim().length > 0 && value.length <= 80),
    },
    skills: { type: String, default: '', trim: true, maxlength: 1000 },
    interests: { type: String, default: '', trim: true, maxlength: 1000 },
    availableDays: { type: String, default: '', trim: true, maxlength: 200 },
    motivation: { type: String, default: '', trim: true, maxlength: 2000 },
    legacyId: { type: String, maxlength: 160 },
    legacyDigest: { type: String, match: /^[a-f0-9]{64}$/ },
    status: { type: String, enum: userStatuses, required: true },
  },
  {
    timestamps: true,
    strict: 'throw',
    versionKey: false,
  },
)

userSchema.index({ email: 1 }, { unique: true, name: 'uniq_user_email' })
userSchema.index(
  { legacyId: 1 },
  { unique: true, sparse: true, name: 'uniq_user_legacy_id' },
)

export type UserDocument = HydratedDocument<UserFields>
export const User = mongoose.models.User ?? mongoose.model<UserFields>('User', userSchema)
