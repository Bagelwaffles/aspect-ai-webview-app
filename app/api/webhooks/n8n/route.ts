import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

/**
 * n8n Workflow Webhook Handler
 * Receives requests from n8n workflows
 * 
 * Canonical route: POST /api/webhooks/n8n
 * 
 * Recognized staged actions:
 * - status.ping → returns 200 ok=true (health check, fully implemented)
 * - relevance.ask.app → returns 501 NOT_IMPLEMENTED until Relevance integration is wired
 * - credits.use → returns 501 NOT_IMPLEMENTED until persistent credit DB logic is wired
 * - credits.add → returns 501 NOT_IMPLEMENTED until persistent credit DB logic is wired
 * 
 * SECURITY:
 * - Verifies x-vo-secret header with timing-safe constant-time comparison
 * - Validates all payloads before processing
 * - Returns 501 for unimplemented handlers (no fake success)
 * - Does not expose secrets or sensitive user data in logs
 */

const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

if (!N8N_WEBHOOK_SECRET) {
  console.warn('WARNING: N8N_WEBHOOK_SECRET not configured - webhook authentication will fail');
}

/**
 * Verify webhook secret from n8n with constant-time comparison
 */
function verifyN8nSignature(headerSecret: string | null): boolean {
  if (!N8N_WEBHOOK_SECRET) {
    console.error('N8N_WEBHOOK_SECRET not set');
    return false;
  }
  
  if (!headerSecret) {
    console.warn('Missing x-vo-secret header');
    return false;
  }
  
  // Check buffer lengths first to avoid timing attack via length mismatch
  const expected = Buffer.from(N8N_WEBHOOK_SECRET);
  const actual = Buffer.from(headerSecret);
  
  if (expected.length !== actual.length) {
    return false;
  }
  
  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(actual, expected);
  } catch (error) {
    console.error('Signature comparison error:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

/**
 * Validate email format (basic)
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate amount is positive integer with reasonable max
 */
function isValidAmount(amount: any, max = 100000): boolean {
  return Number.isInteger(amount) && amount > 0 && amount <= max;
}

/**
 * Handle status.ping action
 * Simple health check from n8n - fully implemented
 */
async function handleStatusPing(): Promise<{ ok: boolean; error?: string }> {
  try {
    console.log('[n8n] Action: status.ping');
    return { ok: true };
  } catch (error) {
    console.error('[n8n] Error in status.ping:', error instanceof Error ? error.message : 'Unknown error');
    return { ok: false, error: 'status_ping_failed' };
  }
}

/**
 * Handle relevance.ask.app action
 * STAGED: Not yet implemented - returns 501 NOT_IMPLEMENTED
 * 
 * When implemented, will query Relevance AI agent from n8n workflow.
 * Requires: RELEVANCE_API_KEY, RELEVANCE_AUTH_TOKEN, and Relevance SDK integration
 */
async function handleRelevanceAsk(payload: any): Promise<{ ok: boolean; error?: string }> {
  const { email, message, assistantId } = payload;
  
  // Validate required fields
  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    return { ok: false, error: 'INVALID_EMAIL' };
  }
  
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return { ok: false, error: 'INVALID_MESSAGE' };
  }
  
  if (!assistantId || typeof assistantId !== 'string') {
    return { ok: false, error: 'INVALID_ASSISTANT_ID' };
  }
  
  try {
    console.log('[n8n] Action: relevance.ask.app (staged)');
    
    // STAGED: Not yet wired to Relevance API
    // TODO: Wire Relevance AI client, validate credentials, call API
    
    return { ok: false, error: 'NOT_IMPLEMENTED' };
  } catch (error) {
    console.error('[n8n] Error in relevance.ask.app:', error instanceof Error ? error.message : 'Unknown error');
    return { ok: false, error: 'handler_error' };
  }
}

/**
 * Handle credits.use action
 * STAGED: Not yet implemented - returns 501 NOT_IMPLEMENTED
 * 
 * When implemented, will deduct credits from user account.
 * Requires: Persistent credit database, request_id-based idempotency backend (Redis/DB), user lookup
 */
async function handleCreditsUse(payload: any): Promise<{ ok: boolean; error?: string }> {
  const { email, amount } = payload;
  
  // Validate required fields
  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    return { ok: false, error: 'INVALID_EMAIL' };
  }
  
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  
  try {
    console.log('[n8n] Action: credits.use (staged)');
    
    // STAGED: Not yet wired to persistent credit database
    // TODO: Implement persistent idempotency via request_id (Redis/DB), credit balance lookup, deduction transaction
    
    return { ok: false, error: 'NOT_IMPLEMENTED' };
  } catch (error) {
    console.error('[n8n] Error in credits.use:', error instanceof Error ? error.message : 'Unknown error');
    return { ok: false, error: 'handler_error' };
  }
}

/**
 * Handle credits.add action
 * STAGED: Not yet implemented - returns 501 NOT_IMPLEMENTED
 * 
 * When implemented, will add credits to user account.
 * Requires: Persistent credit database, request_id-based idempotency backend (Redis/DB), user lookup
 */
async function handleCreditsAdd(payload: any): Promise<{ ok: boolean; error?: string }> {
  const { email, amount } = payload;
  
  // Validate required fields
  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    return { ok: false, error: 'INVALID_EMAIL' };
  }
  
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  
  try {
    console.log('[n8n] Action: credits.add (staged)');
    
    // STAGED: Not yet wired to persistent credit database
    // TODO: Implement persistent idempotency via request_id (Redis/DB), credit balance lookup, addition transaction
    
    return { ok: false, error: 'NOT_IMPLEMENTED' };
  } catch (error) {
    console.error('[n8n] Error in credits.add:', error instanceof Error ? error.message : 'Unknown error');
    return { ok: false, error: 'handler_error' };
  }
}

/**
 * Main webhook POST handler
 * Canonical route: POST /api/webhooks/n8n
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook secret from header
    const secret = request.headers.get('x-vo-secret');
    
    // Verify signature (check length first, then constant-time comparison)
    if (!verifyN8nSignature(secret)) {
      console.warn('[n8n] Webhook authentication failed');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    let payload;
    try {
      payload = await request.json();
    } catch {
      console.error('[n8n] Invalid JSON payload');
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }
    
    // Validate action field
    const { action } = payload;
    if (!action || typeof action !== 'string') {
      console.warn('[n8n] Missing or invalid action field');
      return NextResponse.json(
        { error: 'Missing action field' },
        { status: 400 }
      );
    }
    
    console.log(`[n8n] Webhook: action=${action}`);
    
    // Route to appropriate handler
    let result;
    switch (action) {
      case 'status.ping':
        result = await handleStatusPing();
        break;
      case 'relevance.ask.app':
        result = await handleRelevanceAsk(payload);
        break;
      case 'credits.use':
        result = await handleCreditsUse(payload);
        break;
      case 'credits.add':
        result = await handleCreditsAdd(payload);
        break;
      default:
        console.warn(`[n8n] Unknown action: ${action}`);
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
    // Return appropriate status code
    const statusCode = result.ok ? 200 : result.error === 'NOT_IMPLEMENTED' ? 501 : 400;
    
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error('[n8n] Webhook fatal error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 * GET /api/webhooks/n8n
 * 
 * Returns: configured status only (no secrets exposed)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'listening',
    endpoint: '/api/webhooks/n8n',
    configured: Boolean(N8N_WEBHOOK_SECRET),
  });
}
