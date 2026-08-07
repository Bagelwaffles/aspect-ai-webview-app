# AMS Quick Marketing Audit — Fulfillment Playbook

## Offer

**Price:** $49 one time  
**Delivery promise:** within 48 hours after successful Stripe checkout  
**Fulfillment model at launch:** human-reviewed, AI-assisted service

The buyer receives:

1. Five marketing problems
2. Five specific fixes
3. An improved headline
4. An improved offer
5. One ready-to-use promotional post
6. A practical seven-day action plan

Do not add revenue guarantees, ranking guarantees, fake urgency, fake testimonials, or unsupported claims.

## Intake source

The Stripe Payment Link collects:

- customer name and email
- optional business name
- website or Facebook page
- ideal customer
- biggest marketing challenge

Use the Stripe Checkout Session / payment record as the payment source of truth during the initial manual-fulfillment stage.

## Operator sequence

1. Confirm the Stripe payment succeeded and is not refunded or disputed.
2. Record the order time. The 48-hour delivery clock starts from successful payment.
3. Open the submitted website/Facebook page.
4. Review only public-facing business information relevant to the purchased audit.
5. Capture evidence for each identified problem. Avoid unsupported assumptions about private analytics, revenue, ad spend, or customer data.
6. Draft the audit using the structure below.
7. Run a final quality review:
   - every problem is specific to the business
   - every fix is actionable
   - headline and offer are usable without deceptive claims
   - promotional post matches the stated audience
   - seven-day plan is realistic for a small business
8. Deliver to the same email used at Stripe checkout.
9. Record delivery time and status.
10. Offer a relevant next step only after the promised audit has been delivered.

## AI-assisted drafting prompt

Use this with an approved AMS drafting model. Replace bracketed fields with the buyer's checkout information and public business context.

```text
You are assisting Aspect Marketing Solutions with a paid Quick Marketing Audit.

Buyer/business information:
- Business name: [BUSINESS NAME]
- Website or public page: [URL]
- Ideal customer: [IDEAL CUSTOMER]
- Biggest marketing challenge: [CHALLENGE]

Public observations:
[PASTE SPECIFIC OBSERVATIONS FROM THE BUSINESS'S PUBLIC MARKETING]

Produce a concise, useful audit with exactly these sections:

1. Executive Snapshot
   - 3-5 sentences explaining the main marketing opportunity.

2. Five Marketing Problems
   - Numbered 1-5.
   - Each problem must cite a specific public observation.
   - Do not invent analytics, revenue, conversion rates, customer counts, or private business facts.

3. Five Specific Fixes
   - Numbered 1-5 and mapped directly to the five problems.
   - Prioritize changes the business can realistically make.

4. Improved Headline
   - One primary headline.
   - Optional one-sentence subheadline.
   - Clear, credible, customer-focused language.

5. Improved Offer
   - Reframe the current offer into a clearer value proposition.
   - Include target customer, outcome/value, what is included, and a straightforward CTA.
   - Do not promise guaranteed financial results.

6. One Promotional Post
   - Ready to publish.
   - Natural voice, no fake scarcity, no spam.
   - Include one clear CTA.

7. Seven-Day Action Plan
   - Day 1 through Day 7.
   - One or two concrete actions per day.
   - Sequence highest-value fixes first.

8. Priority Summary
   - Top three actions to do first.

Tone: practical, direct, specific, professional. Avoid filler and generic marketing advice.
```

## Delivery template

Subject:

`Your AMS Quick Marketing Audit — [BUSINESS NAME]`

Opening:

`Thanks for trusting Aspect Marketing Solutions with your Quick Marketing Audit. We reviewed the public marketing information you provided and focused on the highest-leverage improvements we can support from that evidence.`

Then provide the eight audit sections above.

Closing:

`If you want help implementing the recommendations, reply with the one area you want fixed first. We can scope the next step separately. No additional service is started or charged automatically.`

## Launch upsell ladder

Only offer the next step after delivering the paid audit.

- Audit: $49 one time
- Content/implementation pack: price only after scope is approved
- Broader cleanup/implementation: higher-ticket scoped service
- AMS subscription: only when the verified subscription checkout is operational

## Refund / dispute rule

If payment is refunded before fulfillment begins, stop work. If a dispute appears, pause fulfillment and review the payment status before delivering. Do not attempt duplicate charges.
