'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, HeartHandshake, Menu, ShieldCheck, Users, X, CheckCircle, MapPin, Search, Building2 } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import LanguageSelector from './LanguageSelector'
import ChatWidget from './ChatWidget'
import RoleSelectionCard from './RoleSelectionCard'
import { routePath } from '../lib/routes'
import { categories, type SupportCategoryId } from '../lib/categories'
import LogoComponent, { LOGO_URL } from './Logo'
import PageTitleComponent from './PageTitle'
import CategoryGridComponent from './CategoryGrid'
import ButtonComponent from './ui/button'
import ThemeToggle from './ThemeToggle'
import { api } from '../lib/api'
import { ImpactStats, NgoDirectoryEntry } from '../lib/types'

// ── Re-exports so existing imports from PublicShell continue to work ──────────
export { LOGO_URL, categories }
export function Logo() {
  return <LogoComponent />
}
export function Button({
  children,
  onClick,
  type = 'button',
  secondary = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  secondary?: boolean
}) {
  return (
    <ButtonComponent type={type} onClick={onClick} secondary={secondary}>
      {children}
    </ButtonComponent>
  )
}
export function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string
  title: string
  text?: string
}) {
  return <PageTitleComponent eyebrow={eyebrow} title={title} text={text} />
}
export function CategoryGrid({
  navigate,
  onSelect,
}: {
  navigate: (route: string) => void
  onSelect: (category: string) => void
}) {
  return <CategoryGridComponent navigate={navigate} onSelect={onSelect} />
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function PublicNav({ navigate }: { navigate: (route: string) => void }) {
  const [open, setOpen] = useState(false)
  const { t, lang, setLang } = useTranslation()
  const links: [string, string][] = [
    [t('nav.home'), 'home'],
    [t('nav.getHelp'), 'get-help'],
    [t('nav.ngos'), 'ngos'],
    [t('nav.impact'), 'impact'],
    [t('nav.about'), 'about'],
    [t('nav.volunteer'), 'volunteer'],
  ]
  return (
    <header className="topbar">
      <div className="nav-inner">
        <LogoComponent />
        <nav className={open ? 'nav-links open' : 'nav-links'}>
          {links.map(([label, route]) => (
            <Link key={route} href={routePath(route)} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <LanguageSelector value={lang} onChange={setLang} />
          <Link href="/login">{t('nav.login')}</Link>
          <Link className="btn" href="/register">
            {t('nav.register')}
          </Link>
          <Link className="emergency-nav" href="/emergency">
            {t('nav.emergency')}
          </Link>
          <ThemeToggle />
        </nav>
        <ThemeToggle className="mobile-theme-toggle" />
        <button
          className="menu-btn"
          onClick={() => setOpen(!open)}
          aria-label={t('publicShell.openMenu')}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  )
}

// ── Shell wrapper ─────────────────────────────────────────────────────────────
export default function PublicShell({
  children,
  navigate,
}: {
  children: React.ReactNode
  navigate: (route: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <PublicNav navigate={navigate} />
      {children}
      <ChatWidget />
      <footer>
        <div>
          <LogoComponent />
          <p>{t('publicShell.footerCopy')}</p>
        </div>
        <small>© 2026 UMEED · Community support platform</small>
      </footer>
    </>
  )
}

// ── Page-level components ─────────────────────────────────────────────────────
export function HomePage({
  navigate,
  onSelect,
}: {
  navigate: (route: string) => void
  onSelect: (category: string) => void
}) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<ImpactStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    api
      .getImpactStats()
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))
  }, [])

  const categoryFeatureDetails: Record<SupportCategoryId, { desc: string; icon: string }> = {
    'food-support': {
      desc: 'Nutritional kits, staple grain provisions, and emergency meals for families facing hardship.',
      icon: '🍲',
    },
    healthcare: {
      desc: 'Essential prescriptions, medical transport coordination, and elderly medical supplies.',
      icon: '💊',
    },
    education: {
      desc: 'Books, school supplies, learning devices, and one-on-one student mentorship.',
      icon: '📚',
    },
    'elderly-support': {
      desc: 'Home visits, physical mobility aid, essential supplies, and dignified companion care.',
      icon: '🤝',
    },
    'digital-assistance': {
      desc: 'Digital literacy, device access, and guidance using essential online services.',
      icon: '💻',
    },
    mentoring: {
      desc: 'One-on-one guidance, learning support, and encouragement for personal growth.',
      icon: '🧭',
    },
    'essential-resources': {
      desc: 'Clothing, blankets, hygiene kits, temporary shelter relief, and daily essentials.',
      icon: '📦',
    },
  }
  const categoryFeatures = categories.map((category) => ({
    ...category,
    ...categoryFeatureDetails[category.id],
  }))

  const howItWorksSteps = [
    {
      step: '01',
      title: 'Submit with Dignity',
      desc: 'Describe what you or your community needs in a few simple clicks. Your privacy and contact details are strictly safeguarded.',
    },
    {
      step: '02',
      title: 'Matched with Verified NGO',
      desc: 'A background-checked partner NGO operating in your exact city reviews the request and coordinates relief supplies.',
    },
    {
      step: '03',
      title: 'Volunteer Delivers Support',
      desc: 'A trained, verified local volunteer is assigned to fulfill your request and submits a structured field completion report.',
    },
    {
      step: '04',
      title: 'Beneficiary Confirms Outcome',
      desc: 'You directly confirm receipt of assistance and rate the volunteer. No request is closed without your personal confirmation.',
    },
  ]

  return (
    <PublicShell navigate={navigate}>
      <main className="space-y-16 sm:space-y-24 pb-20">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f4f8f5] to-[#fbfaf7] py-16 sm:py-24 border-b border-emerald-950/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100/90 text-emerald-900 border border-emerald-300/60 shadow-xs">
                  <HeartHandshake className="w-4 h-4 text-emerald-700" />
                  <span>EMPOWERING COMMUNITIES · RESTORING HOPE</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#0b3c28] leading-[1.12]">
                  Where Community Support Meets <span className="text-emerald-700 italic font-serif">Compassion</span> and <span className="text-emerald-700 italic font-serif">Dignity</span>.
                </h1>

                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  UMEED directly bridges the gap between individuals seeking urgent support, verified nonprofit organizations, and dedicated field volunteers. Free, transparent, and completely privacy-protected.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('get-help')}
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#135b3a] text-white font-bold text-sm sm:text-base rounded-xl hover:bg-[#0b3c28] transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    Request Support Now <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('volunteer')}
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-white text-[#135b3a] font-bold text-sm sm:text-base rounded-xl hover:bg-emerald-50 border border-emerald-200 transition shadow-xs"
                  >
                    Join as Field Volunteer
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('register-ngo')}
                    className="text-xs sm:text-sm font-semibold text-emerald-800 hover:text-emerald-950 underline px-2 py-2"
                  >
                    Partner as an NGO →
                  </button>
                </div>

                {/* Trust mini-badges */}
                <div className="pt-4 flex flex-wrap items-center gap-6 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> 100% Free Humanitarian Service
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Verified Partner NGOs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> Direct Beneficiary Confirmation
                  </span>
                </div>
              </div>

              {/* Hero Art / Mission Card */}
              <div className="lg:col-span-5">
                <div className="relative mx-auto max-w-md p-6 sm:p-8 bg-white/90 backdrop-blur-md rounded-3xl border border-emerald-900/10 shadow-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                        U
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">UMEED Impact Engine</h4>
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Live Community Network
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                      SECURE
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    "Every person deserves prompt help with dignity. UMEED prevents distress through organized local solidarity."
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100 text-center">
                      <span className="text-[11px] font-bold text-emerald-800 block">Food & Health</span>
                      <strong className="text-xs text-slate-700">Immediate Aid</strong>
                    </div>
                    <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100 text-center">
                      <span className="text-[11px] font-bold text-emerald-800 block">Verified Delivery</span>
                      <strong className="text-xs text-slate-700">Audited Results</strong>
                    </div>
                  </div>

                  <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-center gap-3">
                    <span className="text-2xl">🚨</span>
                    <div className="text-xs">
                      <strong className="text-amber-950 block font-bold">Emergency Assistance Available</strong>
                      <span className="text-amber-800">One-touch location dispatch for urgent danger or crisis.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* REAL IMPACT STATISTICS BAR */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="text-center max-w-xl mx-auto mb-6">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest block">
                Measurable Impact
              </span>
              <h2 className="text-2xl font-bold text-[#0b3c28] mt-1">Real Community Numbers</h2>
              <p className="text-xs text-slate-500 mt-1">
                Aggregated in real-time from verified MongoDB records across participating cities
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
              <div className="p-4 rounded-2xl bg-[#fafcfa] border border-slate-100">
                <span className="text-3xl sm:text-4xl font-extrabold text-[#135b3a] block">
                  {statsLoading ? '—' : stats ? stats.totalRequests : '0'}
                </span>
                <span className="text-xs font-bold text-slate-700 mt-1 block">Total Help Requests</span>
                <span className="text-[11px] text-slate-400">Logged through platform</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#fafcfa] border border-slate-100">
                <span className="text-3xl sm:text-4xl font-extrabold text-emerald-700 block">
                  {statsLoading ? '—' : stats ? stats.resolvedRequests : '0'}
                </span>
                <span className="text-xs font-bold text-slate-700 mt-1 block">Deliveries Completed</span>
                <span className="text-[11px] text-slate-400">Verified by beneficiaries</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#fafcfa] border border-slate-100">
                <span className="text-3xl sm:text-4xl font-extrabold text-sky-700 block">
                  {statsLoading ? '—' : stats ? stats.registeredNgos : '0'}
                </span>
                <span className="text-xs font-bold text-slate-700 mt-1 block">Verified Partner NGOs</span>
                <span className="text-[11px] text-slate-400">Screened organizations</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#fafcfa] border border-slate-100">
                <span className="text-3xl sm:text-4xl font-extrabold text-amber-600 block">
                  {statsLoading ? '—' : stats ? stats.activeVolunteers : '0'}
                </span>
                <span className="text-xs font-bold text-slate-700 mt-1 block">Active Volunteers</span>
                <span className="text-[11px] text-slate-400">Trained local responders</span>
              </div>
            </div>
          </div>
        </section>

        {/* SUPPORT CATEGORIES SECTION */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest block">
              Humanitarian Services
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0b3c28]">What Support Can You Request?</h2>
            <p className="text-sm text-slate-600">
              Select any category to directly begin your assistance request or browse volunteer tasks.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {categoryFeatures.map((cat) => (
              <div
                key={cat.id}
                onClick={() => {
                  onSelect(cat.label)
                  navigate('request-support')
                }}
                className="group cursor-pointer p-6 bg-white rounded-3xl border border-slate-200 hover:border-emerald-600 hover:shadow-md transition space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <span className="text-3xl block group-hover:scale-110 transition origin-left">{cat.icon}</span>
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-800 transition">
                    {t(cat.i18nKey)}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{cat.desc}</p>
                </div>
                <div className="pt-2 text-xs font-bold text-emerald-700 flex items-center gap-1 group-hover:translate-x-1 transition">
                  Request this support <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
            <div
              onClick={() => navigate('emergency')}
              className="group cursor-pointer p-6 bg-white rounded-3xl border border-slate-200 hover:border-emerald-600 hover:shadow-md transition space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <span className="text-3xl block group-hover:scale-110 transition origin-left">🚨</span>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-800 transition">
                  {t('nav.emergency')}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Urgent location-based crisis guidance. UMEED does not dispatch emergency services.
                </p>
              </div>
              <div className="pt-2 text-xs font-bold text-emerald-700 flex items-center gap-1 group-hover:translate-x-1 transition">
                Open Emergency Assistance <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </section>

        {/* HOW UMEED WORKS SECTION */}
        <section className="bg-[#f0f6f2] py-16 sm:py-20 border-y border-emerald-950/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest block">
                Transparent Workflow
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#0b3c28]">How UMEED Works</h2>
              <p className="text-sm text-slate-600">
                A structured, auditable four-step cycle designed to ensure reliability, dignity, and real delivery.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {howItWorksSteps.map((step, idx) => (
                <div
                  key={idx}
                  className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3 relative flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <span className="text-2xl font-black text-emerald-800/80 font-mono block">
                      {step.step}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                  </div>
                  <div className="pt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle className="w-3.5 h-3.5" /> Audited Step
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMMUNITY ROLES & PARTICIPATION */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest block">
              Join the Network
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0b3c28]">How You Can Participate</h2>
            <p className="text-sm text-slate-600">
              Whether you are an individual seeking aid, an NGO expanding reach, or a volunteer in the field.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
                  <HeartHandshake className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">For Beneficiaries</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Request groceries, healthcare coordination, or essential aid. Track the complete lifecycle in real-time and confirm your delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('get-help')}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition"
              >
                Request Assistance
              </button>
            </div>

            <div className="p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">For Volunteers</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Contribute your time, skills, and empathy. Receive assigned relief tasks, submit field reports, and earn direct beneficiary ratings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('volunteer')}
                className="w-full py-2.5 px-4 bg-[#0b3c28] hover:bg-emerald-950 text-white font-bold text-xs rounded-xl transition"
              >
                Join as Volunteer
              </button>
            </div>

            <div className="p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-800 flex items-center justify-center font-bold">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">For Registered NGOs</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Coordinate relief drives in your city, manage volunteer applicants, publish opportunities, and investigate reported community issues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('register-ngo')}
                className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl transition"
              >
                Register Organization
              </button>
            </div>
          </div>
        </section>

        {/* TRUST, DIGNITY & PRIVACY SECTION */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-12 bg-gradient-to-r from-emerald-950 via-teal-950 to-emerald-900 rounded-3xl text-white space-y-8">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest block">
                Trust, Privacy & Governance
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold">Our Non-Negotiable Standards</h2>
              <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed">
                UMEED is engineered to protect vulnerable people. We adhere to rigorous privacy, authentication, and verification principles.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <span className="text-xl">🔒</span>
                <h4 className="text-sm font-bold text-white">Privacy First</h4>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  Beneficiary addresses and phone numbers are never made public. Only the assigned verified volunteer receives delivery details.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xl">🛡️</span>
                <h4 className="text-sm font-bold text-white">Verified Accounts Only</h4>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  All NGOs and field volunteers undergo administrative screening before receiving permissions to coordinate community aid.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xl">⭐</span>
                <h4 className="text-sm font-bold text-white">Beneficiary Control</h4>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  Volunteers cannot approve their own deliveries. The recipient must confirm the items and has the right to report incomplete aid.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xl">📜</span>
                <h4 className="text-sm font-bold text-white">Audited History</h4>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  Every status update, responder authorization, and verification action is stored transactionally in immutable audit collections.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* EMERGENCY BANNER */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-6 sm:p-8 bg-amber-50 border-2 border-amber-300 rounded-3xl flex flex-wrap items-center justify-between gap-6 shadow-xs">
            <div className="space-y-1 max-w-xl">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-widest block">
                Immediate Danger or Distress
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-amber-950">
                Need Urgent Emergency Assistance?
              </h3>
              <p className="text-xs sm:text-sm text-amber-800">
                Share your real-time coordinates securely to notify nearby verified NGO responders and platform administrators.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('emergency')}
              className="px-6 py-3 bg-red-700 hover:bg-red-800 text-white font-bold text-sm rounded-xl transition shadow-md"
            >
              Open Emergency Assistance →
            </button>
          </div>
        </section>
      </main>
    </PublicShell>
  )
}

export function RoleSelectionPage({
  navigate,
}: {
  navigate: (route: string) => void
}) {
  const { t } = useTranslation()
  const [role, setRole] = useState<'seeker' | 'ngo' | 'volunteer' | ''>('')
  const roleCards = [
    {
      id: 'seeker' as const,
      title: t('role.seeker'),
      description: t('publicShell.seekerDescription'),
      Icon: HeartHandshake,
    },
    {
      id: 'ngo' as const,
      title: t('role.ngo'),
      description: t('publicShell.ngoDescription'),
      Icon: ShieldCheck,
    },
    {
      id: 'volunteer' as const,
      title: t('role.volunteer'),
      description: t('publicShell.volunteerDescription'),
      Icon: Users,
    },
  ]
  return (
    <main className="center-page">
      <LogoComponent />
      <PageTitleComponent
        eyebrow={t('register.eyebrow')}
        title={t('register.title')}
        text={t('publicShell.roleExplanation')}
      />
      <div className="role-grid">
        {roleCards.map((card) => (
          <RoleSelectionCard
            key={card.id}
            title={card.title}
            description={card.description}
            Icon={card.Icon}
            selected={role === card.id}
            onSelect={() => {
              setRole(card.id)
              localStorage.setItem('umeed-selected-role', card.id)
            }}
          />
        ))}
      </div>
      <Button onClick={() => role && navigate(`register-${role}`)}>
        {t('continue')} <ArrowRight />
      </Button>
      <button className="back-link" onClick={() => navigate('login')}>
        {t('nav.login')}
      </button>
    </main>
  )
}

export function InfoPage({
  navigate,
  page,
}: {
  navigate: (route: string) => void
  page: string
}) {
  const { t } = useTranslation()
  const [ngos, setNgos] = useState<NgoDirectoryEntry[]>([])
  const [impactStats, setImpactStats] = useState<ImpactStats | null>(null)
  const [ngoSearch, setNgoSearch] = useState('')
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState('')

  useEffect(() => {
    if (page === 'ngos') {
      setDirectoryLoading(true)
      setDirectoryError('')
      api.getNgos()
        .then((data) => setNgos(data))
        .catch(() => setDirectoryError('The verified partner directory is temporarily unavailable.'))
        .finally(() => setDirectoryLoading(false))
    } else if (page === 'impact') {
      api.getImpactStats().then((data) => setImpactStats(data)).catch(() => setImpactStats(null))
    }
  }, [page])

  const filteredNgos = ngos.filter((n) => {
    if (!ngoSearch) return true
    const term = ngoSearch.toLowerCase()
    return (
      n.orgName?.toLowerCase().includes(term) ||
      n.name?.toLowerCase().includes(term) ||
      n.city?.toLowerCase().includes(term) ||
      n.areasOfSupport?.some((a) => a.toLowerCase().includes(term))
    )
  })

  const pageConfig: Record<string, { eyebrow: string; title: string }> = {
    ngos: {
      eyebrow: t('publicShell.partnersEyebrow'),
      title: t('publicShell.partnersTitle'),
    },
    impact: {
      eyebrow: t('publicShell.purposeEyebrow'),
      title: t('publicShell.purposeTitle'),
    },
    about: {
      eyebrow: t('publicShell.aboutEyebrow'),
      title: t('publicShell.aboutTitle'),
    },
  }

  const cfg = pageConfig[page] ?? pageConfig.about

  return (
    <PublicShell navigate={navigate}>
      <main className="info-page">
        <PageTitleComponent
          eyebrow={cfg.eyebrow}
          title={cfg.title}
          text={t('publicShell.infoCopy')}
        />

        {page === 'about' && (
          <div className="info-sections">
            <section className="info-section">
              <h2>{t('about.section1.heading')}</h2>
              <p>{t('about.section1.body')}</p>
            </section>
            <section className="info-section">
              <h2>{t('about.section2.heading')}</h2>
              <ol className="info-steps">
                <li>{t('about.step1')}</li>
                <li>{t('about.step2')}</li>
                <li>{t('about.step3')}</li>
              </ol>
            </section>
          </div>
        )}

        {page === 'ngos' && (
          <div className="info-sections">
            <section className="info-section">
              <h2>{t('ngos.section1.heading')}</h2>
              <p>{t('ngos.section1.body')}</p>
            </section>

            {/* Live NGO Partner Directory */}
            <section className="info-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: 0 }}>Verified Community Partners Directory</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '14px' }}>Active nonprofit organizations collaborating through UMEED.</p>
                </div>
                <div style={{ position: 'relative', width: '280px' }}>
                  <input
                    value={ngoSearch}
                    onChange={(e) => setNgoSearch(e.target.value)}
                    placeholder="Search by city, name, or area..."
                    style={{ paddingLeft: '32px' }}
                  />
                  <Search style={{ position: 'absolute', left: '10px', top: '12px', width: '16px', color: '#888' }} />
                </div>
              </div>

              {directoryError ? (
                <p role="alert">{directoryError}</p>
              ) : directoryLoading ? (
                <p role="status">Loading verified partners…</p>
              ) : filteredNgos.length === 0 ? (
                <p>No verified community partners are currently listed.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                  {filteredNgos.map((ngo) => (
                    <article
                      key={ngo.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        padding: '18px',
                        background: '#fafcfa',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', color: '#135b3a' }}>
                          {ngo.orgName || ngo.name}
                        </h3>
                        <span
                          className="status"
                          style={{
                            background: '#dcfce7',
                            color: '#166534',
                            fontSize: '11px',
                          }}
                        >
                          VERIFIED
                        </span>
                      </div>
                      <p style={{ margin: '8px 0', fontSize: '13px', color: '#555' }}>
                        <MapPin style={{ width: '13px', display: 'inline', marginRight: '4px' }} />
                        {ngo.operatingCity || ngo.city}
                      </p>
                      {ngo.areasOfSupport && ngo.areasOfSupport.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {ngo.areasOfSupport.map((area, i) => (
                            <span
                              key={i}
                              style={{
                                background: '#e5f0e9',
                                color: '#135b3a',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              {area}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="info-section info-section--cta">
              <div>
                <h3 style={{ margin: 0, fontSize: '20px' }}>Are you a registered nonprofit or trust?</h3>
                <p style={{ margin: '6px 0 0' }}>Join our network to coordinate local relief and receive community requests.</p>
              </div>
              <Button onClick={() => navigate('register-ngo')}>
                {t('nav.register')} <ArrowRight />
              </Button>
            </section>
          </div>
        )}

        {page === 'impact' && (
          <div className="info-sections">
            <section className="info-section">
              <h2>{t('impact.section1.heading')}</h2>
              <p>{t('impact.section1.body')}</p>

              {/* Dynamic Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '16px',
                  marginTop: '24px',
                }}
              >
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: '#135b3a' }}>
                    {impactStats ? impactStats.totalRequests : '—'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginTop: '4px' }}>
                    Total Help Requests
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: '#16a34a' }}>
                    {impactStats ? impactStats.resolvedRequests : '—'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginTop: '4px' }}>
                    Cases Resolved
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: '#1d4ed8' }}>
                    {impactStats ? impactStats.registeredNgos : '—'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginTop: '4px' }}>
                    Partner NGOs
                  </div>
                </div>

                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: '#b45309' }}>
                    {impactStats ? impactStats.activeVolunteers : '—'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginTop: '4px' }}>
                    Active Volunteers
                  </div>
                </div>

                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: '#6d28d9' }}>
                    {impactStats ? impactStats.citiesCovered : '—'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginTop: '4px' }}>
                    Cities Covered
                  </div>
                </div>
              </div>
            </section>

            <section className="info-section">
              <h2>Support Category Coverage</h2>
              <p>{t('impact.categories.intro')}</p>
              <div className="category-grid" style={{ marginTop: '20px' }}>
                {categories.map((category) => (
                  <div className="category-card" key={category.id}>
                    <HeartHandshake />
                    <span>
                      <strong>{t(category.i18nKey)}</strong>
                      <small>
                        {impactStats?.categoryBreakdown[category.label]
                          ? `${impactStats.categoryBreakdown[category.label]} Active Requests`
                          : t('publicShell.categorySupport')}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </PublicShell>
  )
}

export function HelpPage({
  navigate,
  onSelect,
}: {
  navigate: (route: string) => void
  onSelect: (category: string) => void
}) {
  const { t } = useTranslation()
  return (
    <PublicShell navigate={navigate}>
      <main className="info-page">
        <PageTitleComponent
          eyebrow={t('publicShell.helpEyebrow')}
          title={t('publicShell.helpTitle')}
          text={t('publicShell.helpCopy')}
        />
        <CategoryGridComponent navigate={navigate} onSelect={onSelect} />
      </main>
    </PublicShell>
  )
}
