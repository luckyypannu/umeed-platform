'use client'

import { useState } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import type { NotificationItem } from '../lib/types'
import { dedupeNotifications, formatDateTime, getRelativeTime } from '../lib/dashboard-helpers'

export default function NotificationCenter({
  notifications,
  onMarkRead,
  onNavigateTab,
}: {
  notifications: NotificationItem[]
  onMarkRead: (id: string) => Promise<void>
  onNavigateTab?: (tab: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [actionError, setActionError] = useState('')

  const deduped = dedupeNotifications(notifications)
  const unreadCount = deduped.filter((n) => !n.read).length
  const displayed = deduped.filter((n) => (filter === 'unread' ? !n.read : true))

  const handleMarkOne = async (id: string) => {
    setMarkingId(id)
    setActionError('')

    try {
      await onMarkRead(id)
    } catch {
      setActionError(
        'Could not mark this notification as read. Please try again.'
      )
    } finally {
      setMarkingId(null)
    }
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    setActionError('')

    try {
      const unread = deduped.filter((n) => !n.read)

      for (const item of unread) {
        await onMarkRead(item.id)
      }
    } catch {
      setActionError(
        'Some notifications could not be marked as read. Please try again.'
      )
    } finally {
      setMarkingAll(false)
    }
  }

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
      case 'alert':
        return <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
      case 'info':
      default:
        return <Info className="w-5 h-5 text-sky-600 flex-shrink-0" />
    }
  }

  const getBorderColor = (type: NotificationItem['type'], read: boolean) => {
    if (read) return 'border-slate-200 bg-white'
    switch (type) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50/40'
      case 'alert':
        return 'border-amber-200 bg-amber-50/40'
      case 'info':
      default:
        return 'border-sky-200 bg-sky-50/40'
    }
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative p-2 bg-emerald-50 text-emerald-800 rounded-lg">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
            <p className="text-xs text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-medium">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md transition ${
                filter === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({deduped.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-md transition ${
                filter === 'unread' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>
{actionError && (
  <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
     <div className="flex-1">
      <p className="text-sm font-medium text-red-800"> {actionError}</p>
       <p className="text-xs text-red-600 mt-1">
        You can try the action again.</p>
  </div>

    <button
      type="button"
      onClick={() => setActionError('')}
      className="text-xs font-medium text-red-700 hover:text-red-900"
    >
      Dismiss
    </button>
  </div>
)}
      {/* Notifications list */}
      {displayed.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {filter === 'unread'
              ? 'You have reviewed all your recent activity.'
              : 'You will receive updates here whenever your requests, assignments or applications progress.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayed.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition shadow-xs flex items-start gap-3.5 ${getBorderColor(
                item.type,
                item.read,
              )}`}
            >
              {getIcon(item.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm ${item.read ? 'text-slate-700 font-normal' : 'text-slate-900 font-semibold'}`}>
                    {item.message}
                  </p>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3 inline" />
                    {getRelativeTime(item.createdAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-slate-400 text-[11px]">{formatDateTime(item.createdAt)}</span>
                  {item.link && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onNavigateTab && item.link?.includes('tab=')) {
                          const tab = new URL(item.link, 'http://localhost').searchParams.get('tab')
                          if (tab) onNavigateTab(tab)
                        } else if (typeof window !== 'undefined' && item.link) {
                          window.location.href = item.link
                        }
                      }}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium"
                    >
                      View details <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {!item.read && (
                    <button
                      type="button"
                      onClick={() => handleMarkOne(item.id)}
                      disabled={markingId === item.id}
                      className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-emerald-700 font-medium"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {markingId === item.id ? 'Marking…' : 'Mark as read'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
