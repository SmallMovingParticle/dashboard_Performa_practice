import { DashboardShell } from './dashboard-shell';
import { demoStaff, demoUser } from './demo-config';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <DashboardShell user={demoUser} staff={demoStaff} />;
}
