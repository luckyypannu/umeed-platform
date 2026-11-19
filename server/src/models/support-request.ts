import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose'

export const requestStatuses = [
  'submitted',
  'under_review',
  'in_progress',
  'awaiting_beneficiary_verification',
  'verified_completed',
  'partially_completed',
  'beneficiary_reported_issue',
  'needs_follow_up',
  'unable_to_contact',
  'task_blocked',
  'resolved',
  'cancelled',
] as const
export type RequestStatus = (typeof requestStatuses)[number]

export const requestUrgencies = ['low', 'medium', 'high', 'critical'] as const
export type RequestUrgency = (typeof requestUrgencies)[number]

export interface SupportRequestFields {
  title: string
  category: string
  description: string
  city: string
  locality: string
  urgency: RequestUrgency
  status: RequestStatus
  seekerId: Types.ObjectId
  seekerName: string
  seekerPhone: string
  assignedNgoId: Types.ObjectId | null
  assignedVolunteerId: Types.ObjectId | null
  notes: string[]
  completionReport: string
  visitDate?: string
  visitTime?: string
  itemsDelivered?: string
  quantityDelivered?: string
  volunteerNotes?: string
  volunteerAvailableAgain?: boolean
  followUpNeeded?: boolean
  deliveryOutcome?: string
  issueType: string
  issueDetails: string
  resolutionNotes?: string
  resolvedAt?: Date | null
  resolvedBy?: Types.ObjectId | null
  rating: number | null
  beneficiaryConfirmedAt: Date | null
  createdAt: Date
  updatedAt: Date
  legacyId?: string
  legacyDigest?: string
}

const supportRequestSchema = new Schema<SupportRequestFields>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    locality: { type: String, default: '', trim: true, maxlength: 120 },
    urgency: { type: String, enum: requestUrgencies, default: 'medium', required: true },
    status: { type: String, enum: requestStatuses, default: 'submitted', required: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seekerName: { type: String, required: true, trim: true, maxlength: 120 },
    seekerPhone: { type: String, default: '', trim: true, maxlength: 32 },
    assignedNgoId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedVolunteerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: {
      type: [String],
      default: ['Request submitted for review.'],
      validate: (values: string[]) =>
        values.length <= 100 && values.every((value) => value.trim().length > 0 && value.length <= 500),
    },
    completionReport: { type: String, default: '', trim: true, maxlength: 2000 },
    visitDate: { type: String, default: '', trim: true, maxlength: 50 },
    visitTime: { type: String, default: '', trim: true, maxlength: 50 },
    itemsDelivered: { type: String, default: '', trim: true, maxlength: 500 },
    quantityDelivered: { type: String, default: '', trim: true, maxlength: 100 },
    volunteerNotes: { type: String, default: '', trim: true, maxlength: 2000 },
    volunteerAvailableAgain: { type: Boolean, default: true },
    followUpNeeded: { type: Boolean, default: false },
    deliveryOutcome: { type: String, default: '', trim: true, maxlength: 50 },
    issueType: { type: String, default: '', trim: true, maxlength: 120 },
    issueDetails: { type: String, default: '', trim: true, maxlength: 2000 },
    resolutionNotes: { type: String, default: '', trim: true, maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rating: { type: Number, default: null, min: 1, max: 5 },
    beneficiaryConfirmedAt: { type: Date, default: null },
    legacyId: { type: String, maxlength: 160 },
    legacyDigest: { type: String, match: /^[a-f0-9]{64}$/ },
  },
  {
    timestamps: true,
    strict: 'throw',
    versionKey: false,
  },
)

supportRequestSchema.index(
  { seekerId: 1, status: 1, createdAt: -1 },
  { name: 'request_seeker_status_created' },
)
supportRequestSchema.index(
  { legacyId: 1 },
  { unique: true, sparse: true, name: 'uniq_request_legacy_id' },
)
supportRequestSchema.index(
  { city: 1, category: 1, status: 1, assignedNgoId: 1 },
  { name: 'request_matching_ngo' },
)
supportRequestSchema.index(
  { assignedNgoId: 1, status: 1, createdAt: -1 },
  { name: 'request_assigned_ngo_status' },
)
supportRequestSchema.index(
  { assignedVolunteerId: 1, status: 1, createdAt: -1 },
  { name: 'request_assigned_volunteer_status' },
)

export type SupportRequestDocument = HydratedDocument<SupportRequestFields>
export const SupportRequest =
  mongoose.models.SupportRequest ??
  mongoose.model<SupportRequestFields>('SupportRequest', supportRequestSchema)
