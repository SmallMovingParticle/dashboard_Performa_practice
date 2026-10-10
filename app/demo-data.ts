import type { ActivityEntry, CadenceVersion, Lead, LeadDetail, LeadStage, Snapshot } from './dashboard-data.ts';
import { appointmentFromRecord, appointmentConflicts, appointmentMinutes, calendarDay, caseTitles, demoPractitioners, shiftCalendarDay } from './appointment-data.ts';
import { clinicWallTimeToIso } from './display.ts';
import { demoLeadTypes, demoLocations, demoStaff, demoUser } from './demo-config.ts';

export const DEMO_STORAGE_KEY = 'perform-demo-v1';
type Row = Record<string, unknown>;
export type DemoStore = { version: 1; snapshot: Snapshot; details: Record<string, LeadDetail>; versions: CadenceVersion[]; nextId: number };
const stages: LeadStage[] = ['new', 'cadence', 'attention', 'booked', 'closed'];
const names = ['Avery Mitchell', 'Jordan Brooks', 'Morgan Hayes', 'Riley Chen', 'Taylor Bennett', 'Cameron Ellis', 'Casey Morgan', 'Quinn Foster', 'Drew Sullivan', 'Reese Walker', 'Peyton Davis', 'Skyler Reed', 'Emerson Blake', 'Finley Cooper', 'Dakota Lewis', 'Rowan Scott', 'Sage Turner', 'Harper Evans', 'Logan Wells', 'Charlie Adams', 'Alexis Grant', 'Parker James', 'Sydney Collins', 'Robin Phillips', 'Blair Anderson', 'Jamie Cole', 'Elliot Green', 'Kendall Price', 'Marley Ross', 'Hayden Clarke', 'Devon Bell', 'Phoenix Lane', 'Spencer Wood', 'Remy Stone', 'Jules Perry', 'Shiloh Gray'];
const json = (value: unknown, status = 200) => Response.json(value, { status });

function recordActivity(detail: LeadDetail, title: string, action: string, details: Row = {}, at = new Date().toISOString()) {
  const entry: ActivityEntry = { id: crypto.randomUUID(), action, occurred_at: at, actor_type: 'employee', actor_name: demoUser.displayName, category: 'employee', title, details };
  detail.activity.unshift(entry);
  detail.lead.updated_at = at;
}

function makeDetail(lead: Lead, version: CadenceVersion, now: Date, runAt = lead.created_at): LeadDetail {
  const progress = lead.cadence_progress ?? 0;
  const finished = lead.stage === 'booked' || lead.stage === 'closed';
  const events = version.steps.map((step, index) => {
    const done = index < progress;
    const scheduledFor = new Date(Date.parse(lead.next_scheduled_for ?? now.toISOString()) + (step.day_offset - (version.steps[progress]?.day_offset ?? 0)) * 86_400_000 + (index - progress) * 60_000).toISOString();
    return { ...step, id: Number(lead.display_id.replace(/\D/g, '')) * 10 + index + (runAt === lead.created_at ? 0 : now.valueOf()), cadence_version_id: version.id, created_at: runAt, scheduled_for: done ? lead.last_contacted_at : scheduledFor, executed_at: done ? lead.last_contacted_at : null, status: done ? 'completed' : finished || !step.is_active ? 'skipped' : 'planned', outcome: done && step.channel === 'call' ? 'booking_link' : null, delivery_status: done && step.channel === 'sms' ? 'delivered' : null };
  });
  const messages: Row[] = progress ? [{ id: `${lead.id}-sms`, direction: 'outbound', occurred_at: lead.last_contacted_at, body: `Hi ${lead.full_name.split(' ')[0]}, this is the Perform Practice Solutions demo team. We received your referral and would love to help find a convenient appointment. What time works best for a quick call?`, delivery_status: lead.stage === 'attention' ? 'pending' : 'delivered' }] : [];
  if (progress && lead.stage !== 'attention') messages.push({ id: `${lead.id}-reply`, direction: 'inbound', occurred_at: lead.last_contacted_at, body: 'Thank you! An afternoon appointment would work best for me.', delivery_status: 'received' });
  const calls: Row[] = progress ? [{ id: `${lead.id}-call`, outreach_event_id: events[0].id, dialed_at: lead.last_contacted_at, duration_seconds: 124, answer_state: 'answered', ended_reason: 'completed', summary_text: 'Fictional demo conversation: the lead requested an afternoon appointment and a follow-up message.', transcript_text: `Demo coordinator: Hi ${lead.full_name.split(' ')[0]}, I am calling from the Perform demo team about your referral.\n${lead.full_name}: Thanks for checking in. An afternoon appointment would be great.\nDemo coordinator: I will note that preference and follow up with the next steps.\n${lead.full_name}: That sounds good. Thank you!` }] : [];
  const detail: LeadDetail = { lead: { ...lead, timezone: 'America/Los_Angeles', do_not_contact: Boolean(lead.number_block) }, events, messages, calls, appointments: [], history: [], activity: [], cadence_actions: [], cadence_version: structuredClone(version) };
  recordActivity(detail, 'Demo referral added', 'lead.created', { location: lead.location, specialty: lead.lead_type }, lead.created_at);
  return detail;
}

export function refreshDemoSnapshot(store: DemoStore): Snapshot {
  for (const detail of Object.values(store.details)) {
    const lead = detail.lead;
    const next = ['booked', 'closed'].includes(String(lead.stage)) ? undefined : detail.events.find((event) => event.status === 'planned');
    lead.next_event_id = next?.id ?? null;
    lead.next_scheduled_for = next?.scheduled_for ?? null;
    lead.next_channel = next?.channel ?? null;
    if (next && lead.stage !== 'attention') lead.next_step = String(next.description).replace(/^Day \d+:\s*/, '');
  }
  for (const detail of Object.values(store.details)) detail.appointments = detail.appointments.map(appointmentFromRecord);
  const counts = { new: 0, cadence: 0, attention: 0, booked: 0, closed: 0 };
  const leads = Object.values(store.details).map((detail) => detail.lead as Lead);
  for (const lead of leads) counts[lead.stage]++;
  const appointments = Object.values(store.details).flatMap((detail) => detail.appointments).sort((a, b) => String(a.start_utc).localeCompare(String(b.start_utc)));
  const active = store.versions.find((version) => version.status === 'active');
  const templates = store.snapshot.templates.filter((template) => template.cadence_step_id == null);
  templates.push(...(active?.steps ?? []).filter((step) => step.channel === 'sms').map((step) => ({
    id: 'cadence-' + step.id, name: step.description, body: step.sms_body,
    cadence_step_id: step.id, cadence_version_id: active?.id, version_name: active?.name,
    day_offset: step.day_offset, is_active: step.is_active, deletable: false,
  })));
  store.snapshot = { ...store.snapshot, counts, leads, appointments, templates,
    cadence: (active?.steps ?? []).map((step) => ({ ...step })), generated_at: new Date().toISOString(),
    system: { provider_queue: 0, handoff_queue: 0, unknown_events: 0, review_queue: counts.attention },
    metrics: demoMetrics(Object.values(store.details)),
    metrics_by_location: Object.fromEntries(demoLocations.map((location) => [location, demoMetrics(Object.values(store.details).filter((detail) => detail.lead.location === location))])),
  };
  return store.snapshot;
}


function demoMetrics(details: LeadDetail[]) {
  const messages = details.flatMap((detail) => detail.messages).filter((item) => item.direction === 'outbound');
  const delivered = messages.filter((item) => item.delivery_status === 'delivered').length;
  const calls = details.flatMap((detail) => detail.calls);
  const pct = (n: number, d: number) => d ? Math.round(n / d * 100) : null;
  return { total_leads: details.length, messages_sent: messages.length, messages_delivered: delivered,
    messages_pending: messages.length - delivered, messages_failed: 0, messages_delivery_rate: pct(delivered, messages.length),
    calls_completed: calls.length, calls_logged: calls.length, calls_completion_rate: pct(calls.length, calls.length),
    calls_reached_rate: pct(calls.length, calls.length), voice_minutes: Math.round(calls.length * 124 / 60),
    voice_seconds: calls.length * 124, voice_cost: 0, booked_appointments: details.flatMap((detail) => detail.appointments).length,
    staff_handoffs: 0, review_rate: pct(details.filter((detail) => detail.lead.needs_review).length, details.length),
    booked_rate: pct(details.filter((detail) => detail.lead.stage === 'booked').length, details.length),
  };
}

export function createDemoStore(reference = new Date()): DemoStore {
  // Anchor presentation slots to the viewer's current date, then label clinic times explicitly.
  const day = reference.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const now = new Date(day + 'T16:00:00Z');
  const at = now.toISOString();
  const version: CadenceVersion = { id: 1, practice_id: 1, lead_id: null, scope: 'global', version_number: 1, name: 'Perform referral outreach', status: 'active', source_version_id: null, activated_at: at, deleted_at: null, created_at: at, updated_at: at, steps: [
    [0, 'call', 'Initial scheduling call'], [0, 'sms', 'Welcome message'], [1, 'call', 'Follow-up call'], [2, 'sms', 'Appointment reminder'], [4, 'call', 'Scheduling check-in'], [5, 'sms', 'Follow-up message'], [7, 'call', 'Final scheduling call'], [8, 'sms', 'Final follow-up'],
  ].map(([day, channel, description], index) => ({ id: index + 1, step_order: index, day_offset: Number(day), channel: channel as 'call' | 'sms', description: `Day ${day}: ${description}`, is_active: true, sms_body: channel === 'sms' ? 'Hi {{first_name}}, this is the Perform demo team following up on your referral. Let us know a convenient time to connect. Reply STOP to opt out.' : null })) };
  const assigned: LeadStage[] = ['new', 'cadence', 'attention', 'cadence', 'new', ...Array<LeadStage>(4).fill('new'), ...Array<LeadStage>(12).fill('cadence'), ...Array<LeadStage>(3).fill('attention'), ...Array<LeadStage>(8).fill('booked'), ...Array<LeadStage>(4).fill('closed')];
  const details: Record<string, LeadDetail> = {};
  names.forEach((name, index) => {
    const stage = assigned[index];
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const lead: Lead = { id, display_id: `PPS-${1001 + index}`, full_name: name, phone: `+120255501${String(index).padStart(2, '0')}`, email: `${name.toLowerCase().replace(' ', '.')}@example.test`, source: ['website_referral', 'partner_referral', 'demo_intake'][index % 3], status: stage === 'booked' ? 'booked' : stage === 'closed' ? 'closed_no_response' : 'new', stage, cadence_state: stage === 'booked' || stage === 'closed' ? 'completed' : index === 12 ? 'paused' : 'active', needs_review: stage === 'attention', review_reason: stage === 'attention' ? (index === 2 ? 'unknown call outcome' : 'pending message delivery confirmation') : null, next_event_id: stage === 'booked' || stage === 'closed' ? null : (1001 + index) * 10 + 3, next_step: stage === 'attention' ? 'Review call result' : stage === 'booked' ? 'Appointment confirmed' : stage === 'closed' ? 'Outreach complete' : index === 0 ? 'Initial scheduling call' : index === 1 ? 'Follow-up message' : index === 3 ? 'Scheduling call' : stage === 'new' ? 'Welcome message' : 'Follow-up call', next_channel: index % 2 ? 'sms' : 'call', next_scheduled_for: ['booked', 'closed'].includes(stage) ? null : new Date(now.valueOf() + (index + 1) * 1_800_000).toISOString(), created_at: new Date(now.valueOf() - (index % 14) * 86_400_000 - 1_800_000).toISOString(), last_contacted_at: stage === 'new' ? null : new Date(now.valueOf() - (index + 1) * 3_600_000).toISOString(), location: demoLocations[index % 3], owner: demoStaff[index % 3].display_name, owner_user_id: demoStaff[index % 3].user_id, lead_type: demoLeadTypes[index % demoLeadTypes.length], referred_by: ['Demo Family Clinic', 'Demo Therapy Group', 'Demo Community Practice'][index % 3], date_of_birth: `19${75 + index % 20}-06-15`, cadence_progress: stage === 'new' ? 0 : stage === 'booked' ? 4 : 3, cadence_total: 8, cadence_version_name: version.name, is_test: true, number_block: null };
    const detail = makeDetail(lead, version, now);
    if (stage === 'booked') detail.appointments.push({ id: `demo-appointment-${index}`, lead_id: id, full_name: name, start_utc: clinicWallTimeToIso(day + 'T' + String([9, 10, 11, 13, 13, 12, 15, 15][index - 24]).padStart(2, '0') + ':00', new Date(0)), duration_minutes: 60, practitioner_id: demoPractitioners[index % 3].id, case_title: caseTitles[(index - 24) % caseTitles.length], booked_at: lead.last_contacted_at, location: lead.location, state: 'scheduled', type: `${lead.lead_type} consultation` });
    details[id] = detail;
  });
  for (const detail of Object.values(details).filter((item) => item.messages.length > 0).slice(0, 20)) {
    detail.messages.push({ id: detail.lead.id + '-follow-up', direction: 'outbound', occurred_at: detail.lead.last_contacted_at, body: 'Thanks for your time. Your Perform demo coordinator will follow up with the next steps.', delivery_status: 'delivered' });
  }
  const store: DemoStore = { version: 1, details, versions: [version], nextId: 100, snapshot: { counts: { new: 0, cadence: 0, attention: 0, booked: 0, closed: 0 }, leads: [], appointments: [], cadence: [], templates: [
    { id: 1, name: 'Referral welcome', body: 'Hi {{first_name}}, welcome to our Perform demo practice! We received your referral. When is a good time to discuss scheduling?', is_active: true, deletable: true },
    { id: 2, name: 'Appointment follow-up', body: 'Hi {{first_name}}, your demo appointment at {{location}} is confirmed. Please let us know if you need to reschedule.', is_active: true, deletable: true },
    { id: 3, name: 'Friendly check-in', body: 'Hi {{first_name}}, just checking in from the Perform demo team. We are here whenever you are ready to take the next step.', is_active: true, deletable: true },
  ], providers: [], system: {} } };
  refreshDemoSnapshot(store);
  return store;
}

function assistantAnswer(store: DemoStore, body: Row): string {
  const selected = Array.isArray(body.lead_ids) ? body.lead_ids.slice(0, 3).map((id) => store.details[String(id)]).filter(Boolean) : [];
  const messages = Array.isArray(body.messages) ? body.messages as Row[] : [];
  const question = String(messages.at(-1)?.content ?? '').toLowerCase();
  let answer: string;
  if (selected.length) answer = selected.map((detail) => {
    if (/call|said|transcript/.test(question)) return `**${detail.lead.full_name}**\n${detail.calls.at(-1)?.summary_text ?? 'No demo call has been recorded yet.'}`;
    if (/text|sms|deliver|link/.test(question)) return `**${detail.lead.full_name}**\n${detail.messages.filter((message) => message.direction === 'outbound').map((message) => `Message status: ${message.delivery_status}.`).join(' ') || 'No demo message has been recorded yet.'}`;
    return `**${detail.lead.full_name}**\n- Stage: ${detail.lead.stage}\n- Outreach: ${detail.lead.cadence_progress} of ${detail.lead.cadence_total} steps (${detail.lead.cadence_state}).\n- Next step: ${detail.lead.next_step ?? 'No pending step'}.\n- Owner: ${detail.lead.owner}.`;
  }).join('\n\n');
  else if (/attention|review/.test(question)) answer = 'The **Needs Attention** column contains referrals waiting for staff review. Open **Review Queue**, inspect the reason, and select **Resolve review** to return a fictional lead to the cadence.';
  else if (/sms|text|booking link/.test(question)) answer = 'Open a lead, choose **Conversations → SMS**, write a sample message, and select **Simulate SMS**. The message is added to the local conversation. No text is sent.';
  else answer = 'This Perform dashboard tracks referrals from **New** through **In Cadence**, **Needs Attention**, **Booked**, and **Closed**. Use the Leads board to move a referral, open its workspace to review conversations, or use Administration to try an eight-step outreach cadence. Select **Reset demo** to restore the sample data.';
  return `**Demo assistant · scripted response**\n\n${answer}\n\nAll records are fictional. No external AI service is connected.`;
}

export async function handleDemoRequest(store: DemoStore, url: string, options: RequestInit = {}): Promise<Response> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const parsed = new URL(url, 'http://localhost');
  if (parsed.origin !== 'http://localhost' || !parsed.pathname.startsWith('/api/dashboard/')) return json({ detail: 'Only local demo requests are supported.' }, 400);
  const path = parsed.pathname.slice('/api/dashboard/'.length).split('/');
  const method = options.method ?? 'GET';
  let body: Row = {};
  try { body = options.body ? JSON.parse(String(options.body)) : {}; } catch { return json({ detail: 'Invalid demo request.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ detail: 'Invalid demo request.' }, 400);
  if (path[0] === 'snapshot' && method === 'GET') return json(refreshDemoSnapshot(store));
  if (path[0] === 'assistant' && method === 'POST') return new Response(`event: delta\ndata: ${JSON.stringify({ content: assistantAnswer(store, body) })}\n\nevent: done\ndata: {}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  if (path[0] === 'appointments' && ['POST', 'PATCH'].includes(method)) {
    const previousDetail = Object.values(store.details).find((detail) => detail.appointments.some((item) => item.id === path[1]));
    const previous = previousDetail?.appointments.find((item) => item.id === path[1]);
    if ((method === 'PATCH' && !previous) || (method === 'POST' && path[1])) return json({ detail: 'Demo appointment not found.' }, 404);
    if (previous && previous.lead_id !== body.lead_id) return json({ detail: 'Edit the booking for its original demo lead.' }, 400);
    const target = store.details[String(body.lead_id)];
    const practitioner = demoPractitioners.find((item) => item.id === body.practitioner_id);
    const duration = Number(body.duration_minutes);
    if (!target || !practitioner || !caseTitles.some((title) => title === body.case_title) || ![30, 60].includes(duration)
      || !Number.isFinite(Date.parse(String(body.start_utc)))) return json({ detail: 'Choose a lead, practitioner, case, date, and valid duration.' }, 400);
    if (target.lead.number_block) return json({ detail: 'Choose a demo lead whose contact number is not blocked.' }, 400);
    const appointment = { id: previous ? String(previous.id) : crypto.randomUUID(), lead_id: target.lead.id,
      full_name: target.lead.full_name, start_utc: new Date(String(body.start_utc)).toISOString(), location: practitioner.location,
      practitioner_id: practitioner.id, duration_minutes: duration, case_title: String(body.case_title), state: 'scheduled',
      type: String(target.lead.lead_type ?? 'Demo') + ' consultation' };
    const minutes = appointmentMinutes(appointment);
    if (minutes < 9 * 60 || minutes + duration > 17 * 60) return json({ detail: 'Choose a time between 9 AM and 5 PM Pacific Time.' }, 400);
    if (appointmentConflicts(Object.values(store.details).flatMap((detail) => detail.appointments.map(appointmentFromRecord)), appointment))
      return json({ detail: 'This practitioner already has an appointment at that time. Choose another slot.' }, 409);
    if (previousDetail) previousDetail.appointments = previousDetail.appointments.filter((item) => item.id !== appointment.id);
    target.appointments.push(appointment);
    target.lead.stage = 'booked'; target.lead.status = 'booked'; target.lead.cadence_state = 'completed';
    target.lead.needs_review = false; target.lead.review_reason = null; target.lead.next_step = 'Appointment confirmed';
    for (const event of target.events) if (event.status === 'planned') event.status = 'skipped';
    recordActivity(target, previous ? 'Demo appointment updated' : 'Demo appointment added', previous ? 'appointment.updated' : 'appointment.created');
    refreshDemoSnapshot(store); return json(appointment, previous ? 200 : 201);
  }
  if (path[0] === 'leads' && !path[1] && method === 'POST') {
    if (!String(body.first_name ?? '').trim() || !String(body.last_name ?? '').trim() || !/^\+\d{11,15}$/.test(String(body.phone)) || !demoLocations.includes(String(body.location)) || !demoLeadTypes.some((type) => type === body.lead_type)) return json({ detail: 'Enter a name, valid phone, specialty, and demo region.' }, 400);
    const prior = Object.values(store.details).find((detail) => detail.lead.idempotency_key === body.idempotency_key);
    if (prior) return json(prior.lead);
    const now = new Date();
    const active = store.versions.find((version) => version.status === 'active');
    if (!active) return json({ detail: 'Activate a demo cadence first.' }, 400);
    const lead: Lead = { ...body, id: crypto.randomUUID(), display_id: `PPS-DEMO-${store.nextId++}`, full_name: `${String(body.first_name).trim()} ${String(body.last_name).trim()}`, phone: String(body.phone), email: body.email ? String(body.email) : null, source: 'demo_intake', stage: 'new', status: 'new', cadence_state: 'active', needs_review: false, review_reason: null, next_event_id: null, next_step: active.steps[0]?.description ?? null, next_channel: active.steps[0]?.channel ?? null, next_scheduled_for: now.toISOString(), created_at: now.toISOString(), last_contacted_at: null, owner: demoUser.displayName, owner_user_id: demoUser.userId, is_test: true, location: String(body.location), lead_type: body.lead_type as Lead['lead_type'], cadence_progress: 0, cadence_total: active.steps.length, cadence_version_name: active.name };
    store.details[lead.id] = makeDetail(lead, active, now);
    refreshDemoSnapshot(store);
    return json(store.details[lead.id].lead, 201);
  }
  const detail = store.details[path[0] === 'review' ? path[1] : path[0] === 'leads' ? path[1] : ''];
  if (path[0] === 'leads' || path[0] === 'review') {
    if (!detail) return json({ detail: 'Demo lead not found.' }, 404);
    const lead = detail.lead;
    if (path.length === 2 && method === 'GET') return json(detail);
    if (path.length === 2 && method === 'DELETE') { delete store.details[lead.id]; return json({ status: 'deleted' }); }
    if (method !== (path[2] === 'outreach-events' ? 'PATCH' : 'POST')) return json({ detail: 'Demo method not supported.' }, 405);
    if (path[2] === 'stage' || path[0] === 'review') {
      const stage = path[0] === 'review' ? 'cadence' : String(body.stage) as LeadStage;
      if (!stages.includes(stage)) return json({ detail: 'Choose a valid demo stage.' }, 400);
      if (lead.number_block && !['closed', 'attention'].includes(stage)) return json({ detail: 'Unblock the demo number before restarting outreach.' }, 400);
      const previous = lead.stage;
      lead.stage = stage; lead.status = stage; lead.needs_review = stage === 'attention'; lead.review_reason = stage === 'attention' ? 'moved to review from the board' : null;
      lead.cadence_state = ['booked', 'closed'].includes(stage) ? 'completed' : 'active';
      if (stage === 'new' || (stage === 'cadence' && ['booked', 'closed'].includes(String(previous)))) {
        const active = store.versions.find((version) => version.status === 'active')!;
        lead.cadence_progress = 0; lead.cadence_total = active.steps.length; lead.cadence_version_name = active.name;
        for (const event of detail.events) if (event.status === 'planned') event.status = 'skipped';
        const now = new Date();
        detail.events.push(...makeDetail(lead as Lead, active, now, now.toISOString()).events); detail.cadence_version = structuredClone(active);
      } else if (['booked', 'closed'].includes(stage)) for (const event of detail.events) if (event.status === 'planned') event.status = 'skipped';
      lead.next_step = stage === 'booked' ? 'Appointment confirmed' : stage === 'closed' ? 'Outreach complete' : stage === 'attention' ? 'Review outreach result' : 'Follow-up call';
      if (stage === 'booked' && !detail.appointments.length) {
        const practitioner = demoPractitioners.find((item) => item.location === lead.location) ?? demoPractitioners[0];
        const appointment = { id: crypto.randomUUID(), lead_id: lead.id, full_name: lead.full_name, start_utc: '', location: practitioner.location,
          practitioner_id: practitioner.id, duration_minutes: 60, case_title: 'Knee', state: 'scheduled', type: 'Demo consultation' };
        const booked = Object.values(store.details).flatMap((item) => item.appointments.map(appointmentFromRecord));
        let offset = 1; let hour = 9;
        do {
          appointment.start_utc = clinicWallTimeToIso(shiftCalendarDay(calendarDay(), offset) + 'T' + String(hour).padStart(2, '0') + ':00', new Date(0));
          if (++hour === 17) { hour = 9; offset++; }
        } while (appointmentConflicts(booked, appointment));
        detail.appointments.push(appointment);
      }
      if (previous === 'booked' && stage !== 'booked') detail.appointments = [];
      recordActivity(detail, path[0] === 'review' ? 'Demo review resolved' : 'Lead stage changed', 'lead.stage', { from: previous, to: stage });
    } else if (path[2] === 'cadence') {
      if (!['pause', 'resume'].includes(String(body.action))) return json({ detail: 'Choose pause or resume.' }, 400);
      if (lead.number_block || ['booked', 'closed'].includes(String(lead.stage))) return json({ detail: 'This demo cadence has ended.' }, 400);
      lead.cadence_state = body.action === 'pause' ? 'paused' : 'active';
      detail.cadence_actions?.push({ action: `cadence.${body.action}`, created_at: new Date().toISOString() });
      recordActivity(detail, body.action === 'pause' ? 'Cadence paused' : 'Cadence resumed', `cadence.${body.action}`);
    } else if (path[2] === 'sms') {
      if (lead.number_block) return json({ detail: 'This demo number is blocked.' }, 400);
      if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 1600) return json({ detail: 'Enter a message of 1–1600 characters.' }, 400);
      detail.messages.push({ id: crypto.randomUUID(), direction: 'outbound', occurred_at: new Date().toISOString(), body: body.body.trim(), delivery_status: 'delivered', simulated: true });
      lead.last_contacted_at = new Date().toISOString();
      recordActivity(detail, 'Demo SMS simulated', 'message.simulated');
    } else if (path[2] === 'contact-rules') {
      if (typeof body.do_not_contact !== 'boolean') return json({ detail: 'Choose a contact rule.' }, 400);
      if (!body.do_not_contact && !['restart', 'continue'].includes(String(body.after_unblock))) return json({ detail: 'Choose how to resume outreach.' }, 400);
      lead.number_block = body.do_not_contact ? { reason: 'Blocked in demo', source: 'Demo team', blocked_at: new Date().toISOString() } : null;
      lead.do_not_contact = body.do_not_contact; lead.stage = body.do_not_contact ? 'closed' : 'cadence'; lead.status = body.do_not_contact ? 'do_not_contact' : 'cadence'; lead.cadence_state = body.do_not_contact ? 'completed' : 'active';
      lead.next_step = body.do_not_contact ? 'Do not contact' : 'Follow-up call';
      lead.needs_review = false; lead.review_reason = null; detail.appointments = [];
      for (const event of detail.events) if (event.status === 'planned') event.status = 'skipped';
      if (!body.do_not_contact) {
        const active = detail.cadence_version!;
        if (body.after_unblock === 'restart') lead.cadence_progress = 0;
        const now = new Date();
        detail.events.push(...makeDetail(lead as Lead, active, now, now.toISOString()).events.filter((event) => event.status === 'planned'));
      }
      recordActivity(detail, body.do_not_contact ? 'Demo number blocked' : 'Demo number unblocked', 'lead.contact_rules');
    } else if (path[2] === 'outreach-events' && method === 'PATCH') {
      const event = detail.events.find((item) => String(item.id) === path[3]);
      if (!event || event.status !== 'planned' || !Number.isFinite(Date.parse(String(body.scheduled_for)))) return json({ detail: 'Choose a valid time for an upcoming step.' }, 400);
      event.scheduled_for = body.scheduled_for; lead.next_scheduled_for = body.scheduled_for;
      recordActivity(detail, 'Demo outreach rescheduled', 'cadence.rescheduled', { scheduled_for: body.scheduled_for });
    } else return json({ detail: 'Demo action not supported.' }, 404);
    refreshDemoSnapshot(store);
    return json(lead);
  }
  if (path[0] === 'cadence-versions') {
    if (method === 'GET') return json({ versions: store.versions });
    const selected = store.versions.find((version) => version.id === Number(path[1] ?? body.source_version_id));
    if (!selected) return json({ detail: 'Demo cadence not found.' }, 404);
    if (method === 'POST' && !path[1]) {
      const draft = { ...structuredClone(selected), id: store.nextId++, version_number: Math.max(...store.versions.map((version) => version.version_number)) + 1, name: `${selected.name} — draft`, status: 'draft' as const, source_version_id: selected.id, deleted_at: null, activated_at: null };
      draft.steps = draft.steps.map((step) => ({ ...step, id: store.nextId++ }));
      store.versions.push(draft); return json(draft, 201);
    }
    if (path[2] === 'activate' && method === 'POST') {
      if (selected.status === 'deleted' || !selected.steps.some((step) => step.is_active)) return json({ detail: 'Activate a valid demo version.' }, 400);
      store.versions.forEach((version) => { if (version.status === 'active') version.status = 'archived'; });
      selected.status = 'active'; selected.activated_at = new Date().toISOString();
    } else if (path[2] === 'permanent' && method === 'DELETE' && selected.status === 'deleted') {
      store.versions = store.versions.filter((version) => version.id !== selected.id); return json({ status: 'permanently_deleted' });
    } else if (method === 'DELETE' && selected.status !== 'active') { selected.status = 'deleted'; selected.deleted_at = new Date().toISOString(); }
    else if ((method === 'PATCH' && path[2] === 'name') || (method === 'PUT' && selected.status === 'draft')) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) return json({ detail: 'Enter a version name.' }, 400);
      if (method === 'PUT') {
        if (!Array.isArray(body.steps) || !body.steps.length || body.steps.some((step: Row) => !step || !Number.isInteger(step.day_offset) || Number(step.day_offset) < 0 || Number(step.day_offset) > 365 || !['call', 'sms'].includes(String(step.channel)) || !String(step.description ?? '').trim() || (step.channel === 'sms' && !String(step.sms_body ?? '').trim()))) return json({ detail: 'Check the demo cadence steps.' }, 400);
        selected.steps = body.steps.map((step: Row, index) => ({ id: store.nextId++, step_order: index, day_offset: Number(step.day_offset), channel: step.channel as 'call' | 'sms', description: String(step.description), is_active: Boolean(step.is_active), sms_body: step.channel === 'sms' ? String(step.sms_body) : null }));
      }
      selected.name = body.name.trim();
    } else return json({ detail: 'This cadence change is not available.' }, 400);
    refreshDemoSnapshot(store); return json(selected);
  }
  if (path[0] === 'cadence-steps' && method === 'PATCH') {
    const step = store.versions.flatMap((version) => version.steps).find((step) => step.id === Number(path[1]));
    if (!step || typeof body.is_active !== 'boolean') return json({ detail: 'Demo step not found.' }, 400);
    step.is_active = body.is_active; return json(step);
  }
  if (path[0] === 'message-templates') {
    const templates = store.snapshot.templates;
    const template = templates.find((item) => String(item.id) === path[1]);
    if (method === 'DELETE' && template?.deletable) { store.snapshot.templates = templates.filter((item) => item !== template); return json({ status: 'permanently_deleted' }); }
    if (!['POST', 'PATCH'].includes(method) || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120 || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 1600) return json({ detail: 'Enter a template name and message.' }, 400);
    if (method === 'POST' && !path[1]) { const item = { id: store.nextId++, name: body.name.trim(), body: body.body.trim(), is_active: true, deletable: true }; templates.push(item); return json(item, 201); }
    if (!template?.deletable) return json({ detail: 'Demo template not found.' }, 404);
    Object.assign(template, { name: body.name.trim(), body: body.body.trim() }); return json(template);
  }
  return json({ detail: 'Demo route not found.' }, 404);
}

let browserStore: DemoStore | undefined;
export async function demoFetch(url: string, options?: RequestInit): Promise<Response> {
  if (!browserStore) {
    try {
      const stored = JSON.parse(typeof window === 'undefined' ? 'null' : localStorage.getItem(DEMO_STORAGE_KEY) ?? 'null') as DemoStore | null;
      if (stored?.version === 1 && stored.snapshot && stored.details && Array.isArray(stored.versions) && Number.isInteger(stored.nextId)) {
        refreshDemoSnapshot(stored); browserStore = stored;
      }
    } catch { /* Invalid or unavailable browser storage starts a fresh demo. */ }
    browserStore ??= createDemoStore();
  }
  const response = await handleDemoRequest(browserStore, url, options);
  if (typeof window !== 'undefined' && response.ok && options?.method && options.method !== 'GET') {
    try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(browserStore)); } catch { /* Demo remains usable in memory when storage is full or disabled. */ }
  }
  return response;
}

export function resetDemo() {
  browserStore = createDemoStore();
  try { if (typeof window === 'undefined') return; localStorage.removeItem(DEMO_STORAGE_KEY); localStorage.removeItem('perform-assistant-chats'); } catch { /* Reset still works without storage. */ }
}
