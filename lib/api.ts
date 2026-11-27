import {
  EmergencyAlert,
  AuditEventSummary,
  HelpRequest,
  ImpactStats,
  NotificationItem,
  NgoDirectoryEntry,
  OpportunityApplicant,
  Role,
  SafeUser,
  PublicVolunteerProfile,
  VerificationTarget,
  VolunteerOpportunity,
  ChatMessage,
} from './types'

let compatibilityToken: string | null = null
let csrfToken: string | null = null

export const api = {
  clearLegacyAuthStorage() {
    if (typeof window === 'undefined') return
    localStorage.removeItem('umeed_auth_token')
    localStorage.removeItem('umeed_auth_user')
  },

  getToken(): string | null {
    return compatibilityToken
  },

  setToken(token: string | null) {
    compatibilityToken = token
  },

  setCsrfToken(token: string | null) {
    csrfToken = token
  },

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = api.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (token) headers.Authorization = `Bearer ${token}`
    const method = (options.method ?? 'GET').toUpperCase()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
      credentials: options.credentials ?? 'same-origin',
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (
        res.status === 401 &&
        api.getToken() !== null &&
        !endpoint.startsWith('/api/auth/login') &&
        !endpoint.startsWith('/api/auth/register') &&
        !endpoint.startsWith('/api/chat') &&
        !endpoint.startsWith('/api/emergency') &&
        typeof window !== 'undefined'
      ) {
        window.dispatchEvent(new Event('umeed-session-expired'))
      }
      if (res.status === 502 || res.status === 503) {
        throw new Error(
          'The server is waking up or temporarily unavailable. Please wait a minute and try again.',
        )
      }
      throw new Error(data.error || `Request failed with status ${res.status}`)
    }

    return data as T
  },

  // Auth
  async login(credentials: { email: string; password: string; role?: Role }): Promise<{
    user: SafeUser
    token: string
    csrfToken: string
  }> {
    const res = await api.request<{
      user: SafeUser
      compatibilityToken: string
      csrfToken: string
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    api.setToken(res.compatibilityToken)
    api.setCsrfToken(res.csrfToken)
    return { user: res.user, token: res.compatibilityToken, csrfToken: res.csrfToken }
  },

  async register(formData: Record<string, any>): Promise<{
    user: SafeUser
    message: string
  }> {
    const res = await api.request<{ user: SafeUser; message: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(formData),
      },
    )
    return res
  },

  async getMe(): Promise<SafeUser> {
    const res = await api.request<{
      user: SafeUser
      csrfToken: string
      compatibilityToken: string
    }>('/api/auth/me')
    api.setToken(res.compatibilityToken)
    api.setCsrfToken(res.csrfToken)
    return res.user
  },

  async updateMe(updates: Partial<SafeUser>): Promise<SafeUser> {
    const res = await api.request<{
      user: SafeUser
      csrfToken: string
      compatibilityToken: string
    }>('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    api.setToken(res.compatibilityToken)
    api.setCsrfToken(res.csrfToken)
    return res.user
  },

  async logout(): Promise<void> {
    try {
      await api.request('/api/auth/logout', { method: 'POST' })
    } finally {
      api.setToken(null)
      api.setCsrfToken(null)
    }
  },

  // Requests
  async getRequests(filters?: {
    seekerId?: string
    category?: string
    city?: string
    status?: string
  }): Promise<HelpRequest[]> {
    const params = new URLSearchParams()
    if (filters?.seekerId) params.set('seekerId', filters.seekerId)
    if (filters?.category) params.set('category', filters.category)
    if (filters?.city) params.set('city', filters.city)
    if (filters?.status) params.set('status', filters.status)

    const query = params.toString() ? `?${params.toString()}` : ''
    const res = await api.request<{ requests: HelpRequest[] }>(`/api/requests${query}`)
    return res.requests
  },

  async getRequestById(id: string): Promise<HelpRequest> {
    const res = await api.request<{ request: HelpRequest }>(`/api/requests/${id}`)
    return res.request
  },

  async createRequest(data: {
    category: string
    description: string
    city: string
    locality?: string
    urgency?: string
    title?: string
    phone?: string
    seekerName?: string
  }): Promise<HelpRequest> {
    const res = await api.request<{ request: HelpRequest }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return res.request
  },

  async updateRequest(
    id: string,
    updates: {
      status?: string
      assignedNgoId?: string
      assignedNgoName?: string
      assignedVolunteerId?: string
      assignedVolunteerName?: string
      note?: string
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
      rating?: number
      beneficiaryConfirmedAt?: string
    },
  ): Promise<HelpRequest> {
    const res = await api.request<{ request: HelpRequest }>(`/api/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    return res.request
  },

  // NGOs
  async getNgos(filters?: { city?: string; category?: string; all?: boolean }): Promise<NgoDirectoryEntry[]> {
    const params = new URLSearchParams()
    if (filters?.city) params.set('city', filters.city)
    if (filters?.category) params.set('category', filters.category)
    if (filters?.all) params.set('all', 'true')

    const query = params.toString() ? `?${params.toString()}` : ''
    const res = await api.request<{ ngos: NgoDirectoryEntry[] }>(`/api/ngos${query}`)
    return res.ngos
  },

  async verifyNgo(id: string, status: 'verified' | 'rejected'): Promise<VerificationTarget> {
    const res = await api.request<{ ngo: VerificationTarget }>(`/api/ngos/${id}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    return res.ngo
  },

  async getNgosForAdmin(): Promise<VerificationTarget[]> {
    const res = await api.request<{ ngos: VerificationTarget[] }>('/api/ngos?all=true')
    return res.ngos
  },

  // Volunteers
  async getVolunteers(): Promise<PublicVolunteerProfile[]> {
    const res = await api.request<{ volunteers: PublicVolunteerProfile[] }>('/api/volunteers')
    return res.volunteers
  },

  async getVolunteersForAdmin(): Promise<VerificationTarget[]> {
    const res = await api.request<{ volunteers: VerificationTarget[] }>('/api/volunteers?all=true')
    return res.volunteers
  },

  async applyAsVolunteer(formData: Record<string, any>): Promise<SafeUser> {
    const res = await api.request<{ volunteer: SafeUser }>('/api/volunteers', {
      method: 'POST',
      body: JSON.stringify({
        fullName: formData.fullName,
        phone: formData.phone,
        city: formData.city,
        locality: formData.locality,
        skills: formData.skills,
        interests: formData.interests,
        categories: formData.categories,
        availableDays: formData.availableDays,
        motivation: formData.motivation,
      }),
    })
    return res.volunteer
  },

  async verifyVolunteer(id: string, status: 'verified' | 'rejected'): Promise<VerificationTarget> {
    const res = await api.request<{ volunteer: VerificationTarget }>(`/api/volunteers/${id}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    return res.volunteer
  },

  // Opportunities
  async getOpportunities(filter?: { category?: string; city?: string }): Promise<VolunteerOpportunity[]> {
    const params = new URLSearchParams()
    if (filter?.category) params.set('category', filter.category)
    if (filter?.city) params.set('city', filter.city)

    const query = params.toString() ? `?${params.toString()}` : ''
    const res = await api.request<{ opportunities: VolunteerOpportunity[] }>(
      `/api/opportunities${query}`,
    )
    return res.opportunities
  },

  async applyToOpportunity(opportunityId: string): Promise<VolunteerOpportunity> {
    const res = await api.request<{ opportunity: VolunteerOpportunity }>(
      '/api/opportunities',
      {
        method: 'POST',
        body: JSON.stringify({ opportunityId }),
      },
    )
    return res.opportunity
  },

  async createOpportunity(data: {
    title: string
    category: string
    mode: 'In-person' | 'Remote'
    city: string
    description: string
  }): Promise<VolunteerOpportunity> {
    const res = await api.request<{ opportunity: VolunteerOpportunity }>(
      '/api/opportunities/create',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
    return res.opportunity
  },

  async getOpportunityApplicants(opportunityId: string): Promise<OpportunityApplicant[]> {
    const res = await api.request<{ applicants: OpportunityApplicant[] }>(
      `/api/opportunities/${opportunityId}/applicants`,
    )
    return res.applicants
  },

  async acceptOpportunityApplicant(opportunityId: string, volunteerId: string): Promise<void> {
    await api.request(`/api/opportunities/${opportunityId}/applicants`, {
      method: 'PATCH',
      body: JSON.stringify({ volunteerId, status: 'accepted' }),
    })
  },

  // Emergency
  async sendEmergencyLocation(coords: {
    latitude: number
    longitude: number
    accuracy?: number
  }): Promise<EmergencyAlert> {
    const res = await api.request<{ alert: EmergencyAlert }>('/api/emergency', {
      method: 'POST',
      body: JSON.stringify({ ...coords, consent: true }),
    })
    return res.alert
  },

  async getEmergencyAlerts(): Promise<EmergencyAlert[]> {
    const res = await api.request<{ alerts: EmergencyAlert[] }>('/api/emergency')
    return res.alerts
  },

  async deleteEmergencyAlert(id: string): Promise<void> {
    await api.request(`/api/emergency/${id}`, { method: 'DELETE' })
  },

  async authorizeEmergencyResponders(id: string, responderIds: string[]): Promise<void> {
    await api.request(`/api/emergency/${id}/responders`, {
      method: 'PATCH',
      body: JSON.stringify({ responderIds }),
    })
  },

  // Chat
  async getChatHistory(): Promise<ChatMessage[]> {
    const res = await api.request<{ messages: ChatMessage[] }>(
      '/api/chat',
    )
    return res.messages
  },

  async sendChatMessage(
    text: string,
  ): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
    const res = await api.request<{
      userMessage: ChatMessage
      assistantMessage: ChatMessage
    }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
    return res
  },

  async clearChatHistory(): Promise<void> {
    await api.request('/api/chat', { method: 'DELETE' })
  },

  // Impact
  async getImpactStats(): Promise<ImpactStats> {
    const res = await api.request<{ stats: ImpactStats }>('/api/impact')
    return res.stats
  },

  async getAuditEvents(limit = 50): Promise<AuditEventSummary[]> {
    const res = await api.request<{ events: AuditEventSummary[] }>(
      `/api/audit-events?limit=${limit}`,
    )
    return res.events
  },

  async getBackendHealth(): Promise<{ status: 'ready' }> {
    const res = await api.request<{ status: 'ready' }>('/api/health')
    return res
  },

  // Notifications
  async getNotifications(): Promise<NotificationItem[]> {
    const res = await api.request<{ notifications: NotificationItem[] }>(
      '/api/notifications',
    )
    return res.notifications
  },

  async markNotificationRead(notificationId: string): Promise<void> {
    await api.request('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ notificationId }),
    })
  },
}
