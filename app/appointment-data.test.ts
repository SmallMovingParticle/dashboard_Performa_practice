import assert from 'node:assert/strict';
import test from 'node:test';
import { appointmentFromRecord, appointmentConflicts, calendarDay, shiftCalendarDay } from './appointment-data.ts';
import { createDemoStore, handleDemoRequest } from './demo-data.ts';

const request = (store: ReturnType<typeof createDemoStore>, path: string, body: unknown, method = 'POST') => handleDemoRequest(store, '/api/dashboard/' + path, { method, body: JSON.stringify(body) });
const fixture = () => createDemoStore(new Date('2026-10-11T06:00:00Z'));

test('calendar days follow clinic time across UTC dates and month boundaries', () => {
  assert.equal(calendarDay('2026-10-12T02:00:00Z'), '2026-10-11');
  assert.equal(shiftCalendarDay('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftCalendarDay('2026-01-01', -1), '2025-12-31');
});

test('adjacent bookings and different practitioners are allowed; overlapping intervals are blocked', () => {
  const original = appointmentFromRecord(fixture().snapshot.appointments[0]);
  assert.equal(appointmentConflicts([original], original), false);
  assert.equal(appointmentConflicts([original], { ...original, id: 'new', start_utc: new Date(Date.parse(original.start_utc) + 30 * 60_000).toISOString() }), true);
  assert.equal(appointmentConflicts([original], { ...original, id: 'new', start_utc: new Date(Date.parse(original.start_utc) + 60 * 60_000).toISOString() }), false);
  assert.equal(appointmentConflicts([original], { ...original, id: 'new', practitioner_id: 'another' }), false);
});

test('appointment creation and editing update the lead, detail, totals, and activity; invalid writes preserve records', async () => {
  const store = fixture();
  const lead = store.snapshot.leads[0];
  const payload = { lead_id: lead.id, practitioner_id: 'avery-collins', start_utc: '2026-10-11T17:00:00Z', duration_minutes: 60, case_title: 'Shoulder' };
  const response = await request(store, 'appointments', payload);
  assert.equal(response.status, 201);
  const saved = await response.json() as { id: string };
  assert.equal(store.snapshot.appointments.length, 9);
  assert.equal(store.snapshot.counts.booked, 9);
  assert.equal(store.details[lead.id].lead.stage, 'booked');
  assert.equal(store.details[lead.id].activity[0].action, 'appointment.created');
  const before = JSON.stringify(store);
  assert.equal((await request(store, 'appointments', { ...payload, lead_id: store.snapshot.leads[1].id })).status, 409);
  assert.equal((await request(store, 'appointments', { ...payload, start_utc: '2026-10-11T15:00:00Z' })).status, 400);
  assert.equal((await request(store, 'appointments', { ...payload, duration_minutes: -30 })).status, 400);
  assert.equal(JSON.stringify(store), before);
  assert.equal((await request(store, 'appointments/' + saved.id, { ...payload, start_utc: '2026-10-11T18:30:00Z', duration_minutes: 30 }, 'PATCH')).status, 200);
  assert.equal(store.snapshot.appointments.length, 9);
  assert.equal(store.details[lead.id].appointments[0].duration_minutes, 30);
  assert.equal(store.details[lead.id].activity[0].action, 'appointment.updated');
  assert.equal(JSON.parse(JSON.stringify(store)).details[lead.id].appointments[0].start_utc, '2026-10-11T18:30:00.000Z');
});
