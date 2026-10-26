import { receive } from '../lib/gateway.js'

// Standalone Node.js Vercel Function. No Next.js middleware or application routes.
export async function POST(request) { return receive(request) }
export function GET() { return new Response(null, { status: 405, headers: { Allow:'POST', 'Cache-Control':'no-store' } }) }
export function HEAD() { return new Response(null, { status: 405, headers: { Allow:'POST', 'Cache-Control':'no-store' } }) }
export function OPTIONS() { return new Response(null, { status: 405, headers: { Allow:'POST', 'Cache-Control':'no-store' } }) }
