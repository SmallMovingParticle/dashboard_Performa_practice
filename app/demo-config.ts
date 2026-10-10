export type StaffUser = { userId: string; employeeId: string; displayName: string; role: 'super_admin' | 'employee' };
export type StaffRosterMember = { user_id: string; employee_id: string; display_name: string; role: StaffUser['role'] };

export const demoUser: StaffUser = { userId: 'demo-admin', employeeId: 'demo-admin', displayName: 'Sam Carter', role: 'super_admin' };
export const demoStaff: StaffRosterMember[] = [
  { user_id: 'demo-admin', employee_id: 'demo-admin', display_name: 'Sam Carter', role: 'super_admin' },
  { user_id: 'demo-alex', employee_id: 'demo-alex', display_name: 'Alex Rivera', role: 'employee' },
  { user_id: 'demo-jamie', employee_id: 'demo-jamie', display_name: 'Jamie Parker', role: 'employee' },
];
export const demoLocations = ['West Coast', 'Central', 'East Coast'];
export const demoLeadTypes = ['Physical Therapy', 'Occupational Therapy', 'Speech Therapy', 'Chiropractic', 'Wellness'] as const;
