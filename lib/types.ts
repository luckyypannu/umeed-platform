export type Role = 'seeker' | 'ngo' | 'volunteer' | 'admin'

export type UserStatus =
  | 'active'
  | 'pending_verification'
  | 'pending_review'
  | 'verified'
  | 'rejected'

export interface User {
  id: string
  email: string
  passwordHash: string
  salt: string
  role: Role
  name: string
  phone: string
  city: string
  locality?: string
  address?: string
  orgName?: string
  contactPerson?: string
  regNumber?: string
  operatingCity?: string
  areasOfSupport?: string[]
  skills?: string
  interests?: string
  availableDays?: string
  motivation?: string
  status: UserStatus
  createdAt: string
  updatedAt?: string
}

export type SafeUser = Omit<User, 'passwordHash' | 'salt'>

export interface PublicVolunteerProfile {
  id: string
  name: string
  city: string
}

export interface VerificationTarget {
  id: string
  name: string
  city: string
  locality?: string
  status: UserStatus
  email?: string
  phone?: string
  orgName?: string
  operatingCity?: string
  contactPerson?: string
  regNumber?: string
  address?: string
  skills?: string
  interests?: string
  availableDays?: string
  areasOfSupport?: string[]
}

export interface NgoDirectoryEntry {
  id: string
  name: string
  orgName?: string
  city: string
  operatingCity?: string
  areasOfSupport: string[]
  email?: string
  phone?: string
  contactPerson?: string
  regNumber?: string
  address?: string
  status?: UserStatus
}

export type RequestStatus =
  | 'submitted'
  | 'under_review'
  | 'in_progress'
  | 'awaiting_beneficiary_verification'
  | 'verified_completed'
  | 'partially_completed'
  | 'beneficiary_reported_issue'
  | 'needs_follow_up'
  | 'unable_to_contact'
  | 'task_blocked'
  | 'resolved'
  | 'cancelled'

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'

export interface HelpRequest {
  id: string
  title: string
  category: string
  description: string
  city: string
  locality?: string
  urgency: UrgencyLevel
  status: RequestStatus
  seekerId: string
  seekerName: string
  seekerPhone?: string
  assignedNgoId?: string
  assignedNgoName?: string
  assignedVolunteerId?: string
  assignedVolunteerName?: string
  notes?: string[]
  completionReport?: string
  visitDate?: string
  visitTime?: string
  itemsDelivered?: string
  quantityDelivered?: string
  volunteerNotes?: string
  volunteerAvailableAgain?: boolean
  followUpNeeded?: boolean
  deliveryOutcome?: string
  issueType?: string
  issueDetails?: string
  resolutionNotes?: string
  resolvedAt?: string
  rating?: number
  beneficiaryConfirmedAt?: string
  createdAt: string
  updatedAt: string
}

export interface VolunteerOpportunity {
  id: string
  title: string
  category: string
  mode: 'In-person' | 'Remote'
  city: string
  description: string
  status: 'open' | 'assigned' | 'completed'
  applicantCount: number
  hasApplied: boolean
  createdAt: string
}

export interface OpportunityApplicant {
  volunteerId: string
  name: string
  city: string
  status: 'applied' | 'accepted'
  appliedAt: string
}

export interface AuditEventSummary {
  id: string
  actorId: string | null
  actorRole: Role | 'anonymous'
  action: string
  targetType: string
  targetId: string
  outcome: 'succeeded' | 'denied' | 'conflict'
  fromStatus?: string
  toStatus?: string
  createdAt: string
}

export interface EmergencyAlert {
  id: string
  latitude: number
  longitude: number
  accuracy?: number
  address?: string
  mapUrl?: string
  contact?: string
  name?: string
  status: 'active' | 'dispatched' | 'resolved'
  createdAt: string
  expiresAt: string
  authorizedResponderIds?: string[]
}

export interface ChatMessage {
  id: string
  sessionId?: string
  userId?: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
}

export interface NotificationItem {
  id: string
  userId?: string
  message: string
  type: 'info' | 'success' | 'alert'
  link?: string
  read: boolean
  createdAt: string
}

export interface ImpactStats {
  totalRequests: number
  resolvedRequests: number
  verifiedCompletedRequests?: number
  partiallyCompletedRequests?: number
  inProgressRequests: number
  awaitingConfirmationRequests?: number
  pendingRequests?: number
  openDisputes?: number
  registeredNgos: number
  activeVolunteers: number
  totalRegisteredUsers?: number
  citiesCovered: number
  categoryBreakdown: Record<string, number>
  statusBreakdown?: Record<string, number>
}
