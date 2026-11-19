import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose'

export const opportunityStatuses = ['open', 'assigned', 'completed'] as const
export const opportunityModes = ['In-person', 'Remote'] as const
export const applicantStatuses = ['applied', 'accepted'] as const

export interface OpportunityApplicantFields {
  volunteerId: Types.ObjectId
  status: (typeof applicantStatuses)[number]
  appliedAt: Date
}

const applicantSchema = new Schema<OpportunityApplicantFields>(
  {
    volunteerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: applicantStatuses, required: true },
    appliedAt: { type: Date, required: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
)

export interface VolunteerOpportunityFields {
  createdById: Types.ObjectId | null
  title: string
  category: string
  mode: (typeof opportunityModes)[number]
  city: string
  description: string
  status: (typeof opportunityStatuses)[number]
  applicants: OpportunityApplicantFields[]
  legacyId?: string
  legacyDigest?: string
  createdAt: Date
  updatedAt: Date
}

const opportunitySchema = new Schema<VolunteerOpportunityFields>(
  {
    createdById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    mode: { type: String, enum: opportunityModes, required: true },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: opportunityStatuses, required: true },
    applicants: {
      type: [applicantSchema],
      default: [],
      validate: (values: OpportunityApplicantFields[]) => values.length <= 1000,
    },
    legacyId: { type: String, maxlength: 160 },
    legacyDigest: { type: String, match: /^[a-f0-9]{64}$/ },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
)

opportunitySchema.index(
  { legacyId: 1 },
  { unique: true, sparse: true, name: 'uniq_opportunity_legacy_id' },
)
opportunitySchema.index(
  { createdById: 1, createdAt: -1 },
  { name: 'opportunity_creator_created' },
)

export type VolunteerOpportunityDocument = HydratedDocument<VolunteerOpportunityFields>
export const VolunteerOpportunity =
  mongoose.models.VolunteerOpportunity ??
  mongoose.model<VolunteerOpportunityFields>('VolunteerOpportunity', opportunitySchema)
