# AMS Gmail send / reply automation — controlled cutover

Status: **Draft PR #262; Preview-only. No production authorization.**

## Outcome for AMS revenue operations

The owner should not need to read every business email. Primary Gmail can send **owner-facing task alerts** and a narrowly qualified, first-contact automated acknowledgment to incoming AMS prospects; secondary Gmail monitors relevant account/business notifications but does **not** send. Substantive answers, refunds, payment/order representations, consent/credential changes, and sensitive customer commitments remain manual approval tasks.

These are different acceptance gates:
1. **Monitoring**: both independent OAuth grants, genuine refresh, metadata filtering, checkpoints, replay suppression, source/account isolation — PASS on Oct. 9 Preview.
2. **Owner alert send**: a real Gmail provider receipt and primary inbox delivery, durably linked to the original event and not resent on retry. Two primary inbox messages were observed; matching backend records are still to be verified.
3. **Customer first-contact acknowledgment**: a *separate* real prospect-thread test. Current backend handles only one fixed, truthful receipt (no AI-generated answer) to a high-confidence directly addressed new inquiry. This has NOT passed real outside-recipient acceptance yet.
4. **Substantive reply agent**: NOT IMPLEMENTED or authorized. Headers-only processing cannot answer free-form questions. Requires approved reply templates/draft review, explicit mailbox-content disclosure and consent if bodies are used, recipient/reply-to validation, prompt-injection defenses, and per-action permissions.
5. **Unattended scheduled execution**: NOT VERIFIED; GitHub/Vercel scheduler gate and independent scheduled proof remain pending. Do not retire the 27 existing ChatGPT tasks.

## Current implementation (not a promise of live automation)

- Primary requests `openid email gmail.readonly gmail.send`. Secondary requests only `openid email gmail.readonly`.
- The user-approved existing first-contact code is `lib/server/owner-gmail-autoreply.ts`, integrated into `runGmailMonitor`; no second mail agent or duplicate OAuth project is needed.
- Current Preview configuration has `AMS_GMAIL_SEND_ENABLED=true` and `AMS_GMAIL_AUTOREPLY_ENABLED=false`; production Gmail remains disabled. Do not set send/auto-reply to true together merely to simulate acceptance.
- Provider `messages.send` can assign a new RFC `Message-ID`, so owner-alert delivery correlates provider message IDs and actual received inbox copies without relying on a fabricated RFC ID. If send outcome is ambiguous, **never automatically resend**.
- `/api/owner/gmail` records only a recent provider-confirmed primary owner inbox receipt tied to the same OAuth grant. This proves a past owner alert, **not** customer-thread acknowledgments, continuous monitoring, or sending ability after grant revocation.
- A matched recipient receives a fixed acknowledgment only, not an AI answer, invoice, purchase confirmation, refund, or promise.

## Minimal gated Preview acceptance test

**Prerequisites**: owner-authenticated Preview; verified and current primary + secondary Gmail grants; signed owner alert transport; owner explicit approval for one controlled external-recipient test; TEST prospect account personally controlled by owner/tester but **not** either AMS monitored email; no broader customer sends.

1. Confirm trusted sender origin, primary-only `gmail.send`, metadata scope, access-token refresh and primary owner alert's latest durable provider/inbox receipt. No secrets or raw headers in logs.
2. Send exactly one NEW test inquiry from the designated test prospect to primary, with a concise ASCII subject such as `Aspect Marketing Solutions pricing question` and a valid RFC `Message-ID`; avoid adding unknown real customers to test traffic.
3. Temporarily enable only the Preview primary monitor **and** `AMS_GMAIL_AUTOREPLY_ENABLED` behind an owner-approved controlled test, leaving all production and original 27 task states unchanged. The test environment must not contain unapproved real customer prospects in the candidate two-hour scan window; otherwise **BLOCK** the test and use an isolated fixture/environment rather than broadcasting.
4. Run one bounded primary monitoring execution; require exactly one Gmail API send to the test prospect in the original thread, and independent confirmation of its recipient copy. Enforce the existing subject/recipient/sender checks and cap of 20/day.
5. Replay the same message/checkpoint and run the worker again: require no duplicate acknowledgment. Test disabled mode, secondary mode, automated lists, refund/payment/security/Google Play messages and unknown recipients with zero sends.
6. Simulate an ambiguous send outcome and verify **no automatic retry**. Verify failing owner alert receipts are not marked delivered.
7. Restore `AMS_GMAIL_AUTOREPLY_ENABLED=false`, disable/pause the Preview primary task, and read back task state; record only redacted evidence IDs, counts, provider status, the test-received acknowledgment and final task flags.
8. Only after all above pass, audit personal-use / personally known users exception applicability for **the actual OAuth project** (including other client IDs), and request a separate production release/activation decision.

## Production activation checklist — separate approval required

- Align OAuth project's actual Google publishing status with AMS local mode. A local seven-day test-mode cutoff does not prove Google's project is in Testing.
- Confirm public privacy policy covers actual Gmail handling; owner-only Google exception must be validated for actual users/clients; no unsupported claim that restricted scopes are verified.
- Resolve/reconcile Draft PR #262 against current `main` without losing already released privacy, manual deletion or Twitch/YouTube improvements. Re-run current-head CI/Previews.
- Require production Google redirects, encrypted vault, webhook HMAC, primary-only recipients, owner session, proper sender identity, no exposed secrets.
- Turn on primary monitoring/alerts first with real scheduled proof. Then separately enable automatic acknowledgments **only after** actual external-recipient test passes and the owner accepts the bounded automatic sends.
- Owner receives only **actionable** exceptions/approval requests; secondary remains monitoring-only. Sales lead qualification and offer follow-up should happen through owner-approved templates/agent actions, not untrusted message subject lines.
- Do not touch Stripe prices, paid subscriptions, Android, unrelated agents, or the 27 ChatGPT task states during Gmail cutover.

## Income-first implementation order

1. Verify the $49 Quick Marketing Audit is available and its fulfillment safeguards work without charging real payment details. Prioritize inbound customer messages and receipt confirmations.
2. Enable primary owner alerts and narrow first-contact acknowledgments once cleared, so leads get a timely response even when the owner is offline.
3. Add a **review queue** for substantive questions, a daily actionable owner brief and approved reusable answers for pricing, audit scope and next steps. Do not invent AI answer send capability before it exists.
4. Pursue higher autonomy only with explicit scope/consent and safeguards. Never infer payment status or order fulfillment from email subject or sender alone.

Sources: 
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- https://developers.google.com/workspace/gmail/api/guides/threads
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
