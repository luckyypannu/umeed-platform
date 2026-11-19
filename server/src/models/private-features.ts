import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose'

export interface EmergencyRecordFields {
  ownerUserId: Types.ObjectId | null
  ownerCredentialHash: string
  latitude: number
  longitude: number
  accuracy: number | null
  consentAt: Date
  authorizedResponderIds: Types.ObjectId[]
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const emergencyRecordSchema = new Schema<EmergencyRecordFields>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ownerCredentialHash: { type: String, default: '', select: false, maxlength: 128 },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    accuracy: { type: Number, default: null, min: 0, max: 100000 },
    consentAt: { type: Date, required: true },
    authorizedResponderIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
)
emergencyRecordSchema.index(
  { ownerUserId: 1, createdAt: -1 },
  { name: 'emergency_owner_created' },
)
emergencyRecordSchema.index(
  { ownerCredentialHash: 1, createdAt: -1 },
  { name: 'emergency_credential_created' },
)
emergencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'emergency_expiry' })
emergencyRecordSchema.index(
  { authorizedResponderIds: 1, createdAt: -1 },
  { name: 'emergency_responder_created' },
)

export interface ChatMessageFields {
  sender: 'user' | 'assistant'
  text: string
  timestamp: Date
}

const chatMessageSchema = new Schema<ChatMessageFields>(
  {
    sender: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 2000 },
    timestamp: { type: Date, required: true },
  },
  { _id: true, strict: 'throw', versionKey: false },
)

export interface ChatSessionFields {
  credentialHash: string
  messages: ChatMessageFields[]
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const chatSessionSchema = new Schema<ChatSessionFields>(
  {
    credentialHash: { type: String, required: true, unique: true, select: false, maxlength: 128 },
    messages: {
      type: [chatMessageSchema],
      default: [],
      validate: (messages: ChatMessageFields[]) => messages.length <= 200,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
)
chatSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'chat_session_expiry' })

export interface NotificationFields {
  recipientId: Types.ObjectId
  message: string
  type: 'info' | 'success' | 'alert'
  link: string
  read: boolean
  createdAt: Date
  updatedAt: Date
  legacyId?: string
  legacyDigest?: string
}

const notificationSchema = new Schema<NotificationFields>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: ['info', 'success', 'alert'], required: true },
    link: { type: String, default: '', maxlength: 300 },
    read: { type: Boolean, default: false, required: true },
    legacyId: { type: String, maxlength: 160 },
    legacyDigest: { type: String, match: /^[a-f0-9]{64}$/ },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
)
notificationSchema.index(
  { recipientId: 1, createdAt: -1 },
  { name: 'notification_recipient_created' },
)
notificationSchema.index(
  { legacyId: 1 },
  { unique: true, sparse: true, name: 'uniq_notification_legacy_id' },
)

export type EmergencyRecordDocument = HydratedDocument<EmergencyRecordFields>
export type ChatSessionDocument = HydratedDocument<ChatSessionFields>
export type NotificationDocument = HydratedDocument<NotificationFields>

export const EmergencyRecord =
  mongoose.models.EmergencyRecord ??
  mongoose.model<EmergencyRecordFields>('EmergencyRecord', emergencyRecordSchema)
export const ChatSession =
  mongoose.models.ChatSession ?? mongoose.model<ChatSessionFields>('ChatSession', chatSessionSchema)
export const Notification =
  mongoose.models.Notification ??
  mongoose.model<NotificationFields>('Notification', notificationSchema)
