import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * Stripe Webhook Handler
 * Processes payment events from Stripe
 * 
 * Canonical route: POST /api/webhooks/stripe
 * 
 * Recognized staged events:
 * - checkout.session.completed → returns 200 received=true (handler staged, DB not wired)
 * - invoice.payment_succeeded → returns 200 received=true (handler staged, DB not wired)
 * - invoice.payment_failed → returns 200 received=true (handler staged, DB not wired)
 * - customer.subscription.created → returns 200 received=true (handler staged, DB not wired)
 * - customer.subscription.updated → returns 200 received=true (handler staged, DB not wired)
 * - customer.subscription.deleted → returns 200 received=true (handler staged, DB not wired)
 * 
 * SECURITY:
 * - Uses Stripe SDK constructEvent() for signature verification
 * - Validates signature before processing (returns 400 if invalid)
 * - Returns 200 for all valid signed events (Stripe expects this to prevent retries)
 * - Does not expose customer IDs, Stripe objects, or secrets in logs
 * - Logs only event type and redacted event ID
 * - All fulfillment handlers staged - returns processed=false with reason
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY not configured');
}

if (!STRIPE_WEBHOOK_SECRET) {
  console.warn('WARNING: STRIPE_WEBHOOK_SECRET not configured - webhook signature verification will fail');
}

// Initialize Stripe client (only if key exists)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

/**
 * Redact event ID for safe logging
 * Returns first 8 chars + ... to identify without exposing full ID
 */
function redactId(id: string): string {
  return `${id.substring(0, 8)}...`;
}

/**
 * Handle checkout.session.completed event
 * STAGED: Not yet implemented - returns processed=false
 * 
 * When implemented, will record checkout completion and fulfill order.
 * Requires: Session lookup, customer/subscription creation, order fulfillment, DB layer
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<{ eventType: string; processed: boolean; reason: string }> {
  try {
    console.log(`[Stripe] Event: checkout.session.completed (${redactId(event.id)})`);
    
    // STAGED: Not yet wired to database
    // TODO: Look up session, extract customer/subscription ID, create user subscription record, trigger fulfillment
    
    return {
      eventType: 'checkout.session.completed',
      processed: false,
      reason: 'DB_HANDLER_NOT_IMPLEMENTED',
    };
  } catch (error) {
    console.error(`[Stripe] Error in checkout.session.completed (${redactId(event.id)}):`, error instanceof Error ? error.message : 'Unknown error');
    return {
      eventType: 'checkout.session.completed',
      processed: false,
      reason: 'handler_error',
    };
  }
}

/**
 * Handle invoice.payment_succeeded event
 * STAGED: Not yet implemented - returns processed=false
 * 
 * When implemented, will update subscription status after invoice payment.
 * Requires: Subscription lookup, status update transaction, DB layer
 */
async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<{ eventType: string; processed: boolean; reason: string }> {
  try {
    console.log(`[Stripe] Event: invoice.payment_succeeded (${redactId(event.id)})`);
    
    // STAGED: Not yet wired to database
    // TODO: Look up subscription by Stripe subscription ID, update status to active, mark renewal timestamp
    
    return {
      eventType: 'invoice.payment_succeeded',
      processed: false,
      reason: 'DB_HANDLER_NOT_IMPLEMENTED',
    };
  } catch (error) {
    console.error(`[Stripe] Error in invoice.payment_succeeded (${redactId(event.id)}):`, error instanceof Error ? error.message : 'Unknown error');
    return {
      eventType: 'invoice.payment_succeeded',
      processed: false,
      reason: 'handler_error',
    };
  }
}

/**
 * Handle invoice.payment_failed event
 * STAGED: Not yet implemented - returns processed=false
 * 
 * When implemented, will record failed payment and trigger retry/notification.
 * Requires: Invoice lookup, failure notification, DB layer
 */
async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<{ eventType: string; processed: boolean; reason: string }> {
  try {
    console.log(`[Stripe] Event: invoice.payment_failed (${redactId(event.id)})`);
    
    // STAGED: Not yet wired to database
    // TODO: Look up invoice, log failure, send notification email, update subscription status
    
    return {
      eventType: 'invoice.payment_failed',
      processed: false,
      reason: 'DB_HANDLER_NOT_IMPLEMENTED',
    };
  } catch (error) {
    console.error(`[Stripe] Error in invoice.payment_failed (${redactId(event.id)}):`, error instanceof Error ? error.message : 'Unknown error');
    return {
      eventType: 'invoice.payment_failed',
      processed: false,
      reason: 'handler_error',
    };
  }
}

/**
 * Handle customer.subscription.created event
 * STAGED: Not yet implemented - returns processed=false
 * 
 * When implemented, will record new subscription.
 * Requires: Customer lookup, subscription creation transaction, DB layer
 */
async function handleSubscriptionCreated(event: Stripe.Event): Promise<{ eventType: string; processed: boolean; reason: string }> {
  try {
    console.log(`[Stripe] Event: customer.subscription.created (${redactId(event.id)})`);
    
    // STAGED: Not yet wired to database
    // TODO: Look up customer, extract subscription details, create subscription record
    
    return {
      eventType: 'customer.subscription.created',
      processed: false,
      reason: 'DB_HANDLER_NOT_IMPLEMENTED',
    };
  } catch (error) {
    console.error(`[Stripe] Error in customer.subscription.created (${redactId(event.id)}):`, error instanceof Error ? error.message : 'Unknown error');
    return {
      eventType: 'customer.subscription.created',
      processed: false,
      reason: 'handler_error',
    };
  }
}

/**
 * Handle customer.subscription.updated event
 * STAGED: Not yet implemented - returns processed=false
 * 
 * When implemented, will update subscription details.
 * Requires: Subscription lookup, update transaction, DB layer
 */
async function handleSubscriptionUpdated(event: Stripe.Event): Promise<{ eventType: string; processed: boolean; reason: string }> {
  try {
    console.log(`[Stripe] Event: customer.subscription.updated (${redactId(event.id)})`);
    
    // STAGED: Not yet wired to database
    // TODO: Look up subscription, update status/period/items
    
    return {
      eventType: 'customer.subscription.updated',
      processed: false,
      reason: 'DB_HANDLER_NOT_IMPLEMENTED',
    };
  } catch (error) {
    console.error(`[Stripe] Error in customer.subscription.updated (${redactId(event.id)}):`, error instanceof Error ? error.message : 'Unknown error');
    return {
      eventType: 'customer.subscription.updated',
      processed: false,
      reason: 'handler_error',
    };
  }
}

/**
 * Handle customer.subscription.deleted event
 * STAGED: Not yet implemented - returns processed=false
 * 
 * When implemented, will mark subscription as cancelled.
 * Requires: Subscription lookup, cancellation transaction, DB layer
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<{ eventType: string; processed: boolean; reason: string }> {
  try {
    console.log(`[Stripe] Event: customer.subscription.deleted (${redactId(event.id)})`);
    
    // STAGED: Not yet wired to database
    // TODO: Look up subscription, mark as cancelled, set cancellation date
    
    return {
      eventType: 'customer.subscription.deleted',
      processed: false,
      reason: 'DB_HANDLER_NOT_IMPLEMENTED',
    };
  } catch (error) {
    console.error(`[Stripe] Error in customer.subscription.deleted (${redactId(event.id)}):`, error instanceof Error ? error.message : 'Unknown error');
    return {
      eventType: 'customer.subscription.deleted',
      processed: false,
      reason: 'handler_error',
    };
  }
}

/**
 * Main webhook POST handler
 * Canonical route: POST /api/webhooks/stripe
 * 
 * Returns HTTP 200 for all valid signed events (Stripe expectation).
 * Returns HTTP 400/401 only for signature/request validation failures.
 */
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      console.error('[Stripe] Stripe SDK not initialized - missing STRIPE_SECRET_KEY');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 503 }
      );
    }

    if (!STRIPE_WEBHOOK_SECRET) {
      console.error('[Stripe] Missing STRIPE_WEBHOOK_SECRET');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 503 }
      );
    }

    // Get raw body and signature
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      console.warn('[Stripe] Missing stripe-signature header');
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 400 }
      );
    }

    // Verify signature using Stripe SDK
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[Stripe] Signature verification failed:', errorMessage);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log(`[Stripe] Webhook received: ${event.type} (${redactId(event.id)})`);

    // Route to appropriate handler
    let result;
    switch (event.type) {
      case 'checkout.session.completed':
        result = await handleCheckoutSessionCompleted(event);
        break;
      case 'invoice.payment_succeeded':
        result = await handleInvoicePaymentSucceeded(event);
        break;
      case 'invoice.payment_failed':
        result = await handleInvoicePaymentFailed(event);
        break;
      case 'customer.subscription.created':
        result = await handleSubscriptionCreated(event);
        break;
      case 'customer.subscription.updated':
        result = await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        result = await handleSubscriptionDeleted(event);
        break;
      default:
        console.log(`[Stripe] Unhandled event type: ${event.type} (${redactId(event.id)})`);
        result = {
          eventType: event.type,
          processed: false,
          reason: 'UNHANDLED_EVENT_TYPE',
        };
    }

    // Return 200 for all valid signed events (Stripe requirement)
    return NextResponse.json({ received: true, ...result }, { status: 200 });
  } catch (error) {
    console.error('[Stripe] Webhook fatal error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 * GET /api/webhooks/stripe
 * 
 * Returns: configured status only (no secrets exposed)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'listening',
    endpoint: '/api/webhooks/stripe',
    configured: Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET),
  });
}
