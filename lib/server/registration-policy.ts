import type { Role } from '../types'

const publicRegistrationRoles = ['seeker', 'ngo', 'volunteer'] as const satisfies readonly Role[]

export function isPublicRegistrationRole(role: unknown): role is (typeof publicRegistrationRoles)[number] {
  return (
    typeof role === 'string' &&
    publicRegistrationRoles.some((publicRole) => publicRole === role)
  )
}
