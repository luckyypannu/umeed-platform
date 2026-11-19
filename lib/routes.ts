export function routePath(route: string): string {
  const paths: Record<string, string> = {
    home: '/', login: '/login', 'role-selection': '/register', register: '/register', volunteer: '/volunteer', chat: '/chat', emergency: '/emergency', dashboard: '/dashboard', 'request-support': '/dashboard?tab=request-support', 'my-requests': '/dashboard?tab=my-requests', 'request-details': '/dashboard?tab=request-details', notifications: '/dashboard?tab=notifications', profile: '/dashboard?tab=profile', 'ngo-dashboard': '/dashboard?role=ngo', 'ngo-requests': '/dashboard?role=ngo&tab=ngo-requests', 'ngo-profile': '/dashboard?role=ngo&tab=profile', 'volunteer-dashboard': '/dashboard?role=volunteer', 'volunteer-opportunities': '/dashboard?role=volunteer&tab=volunteer-opportunities', 'volunteer-status': '/dashboard?role=volunteer&tab=volunteer-status', 'admin-dashboard': '/dashboard?role=admin', 'admin-verifications': '/dashboard?role=admin&tab=verifications', 'get-help': '/get-help', ngos: '/ngos', impact: '/impact', about: '/about',
  }
  if (route.startsWith('register-')) return `/register/${route.replace('register-', '')}`
  return paths[route] ?? '/'
}
