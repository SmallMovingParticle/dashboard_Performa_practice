import { demoFetch } from './demo-data.ts';

// Every dashboard operation is simulated locally; this demo never calls a backend.
export function dashboardFetch(url: string, options?: RequestInit): Promise<Response> {
  return demoFetch(url, options);
}
