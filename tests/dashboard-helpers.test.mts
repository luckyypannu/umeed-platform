import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dedupeNotifications,
  getRequestProgress,
  maskContactDetail,
  getStatusBadgeInfo,
  getUrgencyBadgeInfo,
  getRequestTimeline,
} from '../lib/dashboard-helpers.ts'

test('notification deduping removes repeated pending alerts while preserving latest records', () => {
  const notifications = [
    { id: 'a', message: 'Request updated', type: 'info', read: false, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', message: 'Request updated', type: 'info', read: false, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c', message: 'Different alert', type: 'alert', read: true, createdAt: '2026-01-03T00:00:00.000Z' },
  ] as any

  const deduped = dedupeNotifications(notifications)
  assert.equal(deduped.length, 2)
  assert.ok(deduped.some((item) => item.id === 'b'))
  assert.ok(deduped.some((item) => item.id === 'c'))
})

test('request progress reflects live workflow status', () => {
  assert.equal(getRequestProgress('submitted'), 12)
  assert.equal(getRequestProgress('under_review'), 28)
  assert.equal(getRequestProgress('in_progress'), 64)
  assert.equal(getRequestProgress('resolved'), 100)
  assert.equal(getRequestProgress('cancelled'), 0)
})

test('contact masking preserves privacy without exposing full beneficiary data', () => {
  assert.equal(maskContactDetail('9876543210'), '98******10')
  assert.equal(maskContactDetail('AB'), '**')
  assert.equal(maskContactDetail(undefined), 'Private')
})

test('badge info and request timeline reflect lifecycle steps', () => {
  assert.equal(getStatusBadgeInfo('awaiting_beneficiary_verification').label, 'Awaiting Beneficiary Confirmation')
  assert.equal(getUrgencyBadgeInfo('critical').label, 'Critical Urgency')

  const sampleRequest = {
    id: 'req1',
    title: 'Food Ration',
    category: 'Food Support',
    description: 'Dry rations needed',
    city: 'Mumbai',
    urgency: 'high',
    status: 'awaiting_beneficiary_verification',
    seekerId: 'user1',
    seekerName: 'Beneficiary Name',
    assignedNgoId: 'ngo1',
    assignedNgoName: 'Helping Hands',
    assignedVolunteerId: 'vol1',
    assignedVolunteerName: 'Rahul V',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
  } as any

  const timeline = getRequestTimeline(sampleRequest)
  assert.ok(timeline.length >= 4)
  assert.equal(timeline[0].title, 'Request Submitted')
  assert.equal(timeline[0].state, 'complete')
  assert.ok(timeline.some((step) => step.title === 'Awaiting Your Confirmation' && step.state === 'current'))
})
