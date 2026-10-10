import { DashboardShell } from './../dashboard-shell';
import { demoStaff, demoUser } from '../demo-config';

export const dynamic = 'force-dynamic';

export default function DashboardRoute() {
  return <DashboardShell user={demoUser} staff={demoStaff} />;
}
