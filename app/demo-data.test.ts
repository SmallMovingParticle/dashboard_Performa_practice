import assert from 'node:assert/strict';
import test from 'node:test';
import type { Lead, CadenceVersion } from './dashboard-data.ts';
import { createDemoStore, handleDemoRequest, refreshDemoSnapshot } from './demo-data.ts';

const makeStore = () => createDemoStore(new Date('2026-10-11T06:00:00Z'));
const write = (store: ReturnType<typeof makeStore>, path: string, body: unknown = {}, method = 'POST') => handleDemoRequest(store, '/api/dashboard/' + path, { method, body: JSON.stringify(body) });

test('fixtures cover every stage and totals come from the fictional records', () => {
  const store = makeStore();
  assert.deepEqual(store.snapshot.counts, { new: 6, cadence: 14, attention: 4, booked: 8, closed: 4 });
  assert.equal(store.snapshot.appointments.length, 8);
  assert.equal(store.snapshot.metrics?.messages_delivery_rate, 92);
  assert.equal(store.snapshot.metrics_by_location?.['West Coast'].total_leads, 12);
  assert.equal(Object.values(store.snapshot.metrics_by_location ?? {}).reduce((sum, metrics) => sum + metrics.messages_sent, 0), store.snapshot.metrics?.messages_sent);
  assert.equal(store.snapshot.templates.filter((template) => template.cadence_step_id != null).length, 4);
  assert.ok(store.snapshot.leads.every((lead) => lead.is_test && lead.email?.endsWith('@example.test') && /^\+120255501\d\d$/.test(lead.phone ?? '')));
  assert.equal(refreshDemoSnapshot(JSON.parse(JSON.stringify(store))).leads.length, 36);
});

test('create, book, review, pause, block, unblock, and delete update related records', async () => {
  const store = makeStore();
  const payload = { idempotency_key: 'test-create', first_name: 'Demo', last_name: 'Referral', phone: '+12025550199', email: 'demo@example.test', lead_type: 'Speech Therapy', location: 'West Coast', contact_consent: true };
  const created = await (await write(store, 'leads', payload)).json() as Lead;
  assert.equal((await (await write(store, 'leads', payload)).json() as Lead).id, created.id);
  assert.equal(refreshDemoSnapshot(store).leads.length, 37);
  await write(store, 'leads/' + created.id + '/stage', { stage: 'booked' });
  assert.equal(refreshDemoSnapshot(store).appointments.length, 9);
  await write(store, 'leads/' + created.id + '/stage', { stage: 'new' });
  assert.equal(refreshDemoSnapshot(store).appointments.length, 8);
  await write(store, 'leads/' + created.id + '/cadence', { action: 'pause' });
  assert.equal(store.details[created.id].lead.cadence_state, 'paused');
  await write(store, 'leads/' + created.id + '/cadence', { action: 'resume' });
  assert.equal(store.details[created.id].lead.cadence_state, 'active');
  await write(store, 'leads/' + created.id + '/contact-rules', { do_not_contact: true });
  assert.equal((await write(store, 'leads/' + created.id + '/sms', { body: 'Blocked sample' })).status, 400);
  await write(store, 'leads/' + created.id + '/contact-rules', { do_not_contact: false, after_unblock: 'restart' });
  assert.equal((await write(store, 'leads/' + created.id + '/sms', { body: 'Allowed sample' })).status, 200);
  assert.equal(store.details[created.id].messages.at(-1)?.simulated, true);
  const flagged = store.snapshot.leads.find((lead) => lead.stage === 'attention')!;
  await write(store, 'review/' + flagged.id + '/resolve');
  assert.equal(refreshDemoSnapshot(store).counts.attention, 3);
  assert.equal(store.details[flagged.id].lead.needs_review, false);
  await write(store, 'leads/' + created.id, {}, 'DELETE');
  assert.equal(refreshDemoSnapshot(store).leads.length, 36);
});

test('cadence drafts and templates save locally while old lead versions are retained', async () => {
  const store = makeStore();
  const draft = await (await write(store, 'cadence-versions', { source_version_id: 1 })).json() as CadenceVersion;
  assert.equal(draft.version_number, 2);
  draft.steps[0].is_active = false;
  const saved = await write(store, 'cadence-versions/' + draft.id, { name: 'Demo v2', steps: draft.steps }, 'PUT');
  assert.equal(saved.status, 200);
  await write(store, 'cadence-versions/' + draft.id + '/activate');
  assert.equal(store.versions.find((version) => version.id === 1)?.status, 'archived');
  assert.equal(Object.values(store.details)[0].cadence_version?.id, 1);
  const closed = store.snapshot.leads.find((lead) => lead.stage === 'closed')!;
  await write(store, 'leads/' + closed.id + '/stage', { stage: 'cadence' });
  assert.equal(store.details[closed.id].cadence_version?.id, draft.id);
  assert.equal(store.details[closed.id].events.filter((event) => event.status === 'planned').length, 7);
  assert.equal(store.details[closed.id].lead.next_channel, 'sms');
  const template = await (await write(store, 'message-templates', { name: 'Demo copy', body: 'Hello {{first_name}}' })).json() as { id: number };
  await write(store, 'message-templates/' + template.id, { name: 'Updated copy', body: 'Updated demo' }, 'PATCH');
  assert.equal(store.snapshot.templates.find((item) => item.id === template.id)?.body, 'Updated demo');
  await write(store, 'message-templates/' + template.id, {}, 'DELETE');
  assert.equal(store.snapshot.templates.some((item) => item.id === template.id), false);
});

test('invalid input and cancellation preserve the demo; assistant identifies its scripted output', async () => {
  const store = makeStore();
  const before = JSON.stringify(store);
  assert.equal((await write(store, 'leads', { first_name: 'Incomplete' })).status, 400);
  assert.equal(JSON.stringify(store), before);
  assert.equal((await handleDemoRequest(store, '/api/dashboard/leads', { method: 'POST', body: '{' })).status, 400);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(handleDemoRequest(store, '/api/dashboard/snapshot', { signal: controller.signal }), { name: 'AbortError' });
  const response = await write(store, 'assistant/stream', { messages: [{ role: 'user', content: 'How does the cadence work?' }] });
  assert.match(await response.text(), /scripted response/);
});
