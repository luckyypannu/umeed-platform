import type { UserRole, UserStatus } from '../models/user.js'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  status: UserStatus
}

export interface RequestAuth {
  user: AuthenticatedUser
  sessionId: string
  sessionToken: string
}

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth
    }
  }
}

export {}
