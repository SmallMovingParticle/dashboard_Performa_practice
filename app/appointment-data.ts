import { clinicDateTimeValue } from './display.ts';

export const demoPractitioners = [
  { id: 'avery-collins', name: 'Avery Collins, PT', location: 'West Coast', color: 'blue' },
  { id: 'jordan-ellis', name: 'Jordan Ellis, PT', location: 'Central', color: 'violet' },
  { id: 'morgan-reed', name: 'Morgan Reed, PT', location: 'East Coast', color: 'teal' },
] as const;
export const caseTitles = ['Knee', 'Shoulder', 'Hip', 'Lower back'] as const;
export const scheduleHours = Array.from({ length: 8 }, (_, index) => index + 9);
export type DemoAppointment = {
  id: string; lead_id: string; full_name: string; start_utc: string; location: string;
  practitioner_id: string; duration_minutes: number; case_title: string; state: string; type: string;
};

export function calendarDay(value: unknown = new Date().toISOString()) {
  return clinicDateTimeValue(value).slice(0, 10);
}
export function shiftCalendarDay(day: string, days: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function appointmentFromRecord(record: Record<string, unknown>, index = 0): DemoAppointment {
  const practitioner = demoPractitioners.find((item) => item.id === record.practitioner_id)
    ?? demoPractitioners.find((item) => item.location === record.location) ?? demoPractitioners[0];
  return { id: String(record.id), lead_id: String(record.lead_id), full_name: String(record.full_name ?? 'Demo lead'),
    start_utc: String(record.start_utc), location: practitioner.location, practitioner_id: practitioner.id,
    duration_minutes: Number(record.duration_minutes ?? 60), case_title: String(record.case_title ?? caseTitles[index % caseTitles.length]),
    state: String(record.state ?? 'scheduled'), type: String(record.type ?? 'Demo consultation') };
}
export function appointmentMinutes(appointment: DemoAppointment) {
  const wall = clinicDateTimeValue(appointment.start_utc);
  return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
}
export function appointmentConflicts(appointments: DemoAppointment[], candidate: DemoAppointment) {
  const start = Date.parse(candidate.start_utc);
  const end = start + candidate.duration_minutes * 60_000;
  return appointments.some((item) => item.id !== candidate.id && item.practitioner_id === candidate.practitioner_id
    && Date.parse(item.start_utc) < end && Date.parse(item.start_utc) + item.duration_minutes * 60_000 > start);
}
