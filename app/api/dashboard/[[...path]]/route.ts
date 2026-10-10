function demoOnly() {
  return Response.json({ detail: 'Client preview only. Dashboard actions run locally with fictional data.' }, { status: 410 });
}
export const GET = demoOnly;
export const POST = demoOnly;
export const PATCH = demoOnly;
export const PUT = demoOnly;
export const DELETE = demoOnly;
