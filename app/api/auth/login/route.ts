export async function POST() {
  return Response.json({ detail: 'Demo only. Open the dashboard without signing in.' }, { status: 410 });
}
