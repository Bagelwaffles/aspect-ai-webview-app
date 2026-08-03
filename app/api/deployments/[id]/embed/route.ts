export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return new Response("// AMS deployment not found\n", {
    status: 404,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
