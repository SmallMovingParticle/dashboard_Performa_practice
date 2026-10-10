import assert from 'node:assert/strict';
import test from 'node:test';
import type { Snapshot, LeadDetail } from './dashboard-data.ts';
import { dashboardFetch } from './dashboard-client.ts';
import { resetDemo } from './demo-data.ts';

test('dashboard actions use fictional local data and never reach the network', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected live request'); };
  try {
    resetDemo();
    const snapshot = await (await dashboardFetch('/api/dashboard/snapshot')).json() as Snapshot;
    assert.equal(snapshot.leads.length, 36);
    const id = snapshot.leads[0].id;
    assert.equal((await dashboardFetch('/api/dashboard/leads/' + id + '/sms', { method: 'POST', body: JSON.stringify({ body: 'Fictional browser demo message' }) })).status, 200);
    const detail = await (await dashboardFetch('/api/dashboard/leads/' + id)).json() as LeadDetail;
    assert.equal(detail.messages.at(-1)?.simulated, true);
    resetDemo();
    assert.equal((await (await dashboardFetch('/api/dashboard/leads/' + id)).json() as LeadDetail).messages.length, 0);
    assert.equal((await dashboardFetch('https://example.com/api/dashboard/snapshot')).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});
