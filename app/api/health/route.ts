export async function GET() {
  return Response.json({
    ok: true,
    service: "aspect-marketing-solutions",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    status: "healthy",
  })
}
