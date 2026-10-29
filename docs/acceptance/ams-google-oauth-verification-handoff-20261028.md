# AMS Google OAuth verification — evidence-first owner handoff

**Checkpoint:** October 28, 2026 CDT (October 29 UTC). **Status: Google Console outcome UNVERIFIED. Draft/HOLD; no provider submission authorized by this document.** This is an execution handoff for the already existing Google project, not a request to rebuild Gmail OAuth, create an OAuth client, reauthorize accounts, or change Production.

## Already published Google-facing site preparation — DO NOT REPEAT

- [PR #271](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/271) **was already merged** into `main` and the public homepage now visibly includes the owner-only Gmail feature description with Privacy and Terms links. The prior submission packet `docs/AMS_GOOGLE_OAUTH_VERIFICATION_PACKET.md` is also **already on main**. Its October 10 heading is historical: recheck the actual published homepage before claiming the disclosure is still Draft.
- The newer handoff in this document is a current-status and live-Console review supplement to that original packet, not a replacement or request to republish the same pages.
- The live public homepage was independently accessible to a web reader on Oct 28; the `/privacy` URL was linked but this reader's cache lookup returned an error, **not** a demonstrated site 404. Confirm directly in the authorized owner browser.

## Project and independent completed work

- Project: `aspect-marketing-solutions`, number `13801315898`. Existing `Aspect Marketing Solutions Web` OAuth client is reused; historical console audit also found a separate `YouTube Upload` client. Preserve both until reviewed.
- Draft [PR #262](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/262): owner-only two-slot Gmail monitoring and alert backend. Exact head before this documentation: `7a7b4aaa803fd097ae53ba3e9e521d657ba6c865`; Reconciliation CI and Secret Scan SUCCESS. Retain the two grants and original **27** scheduled task records/states.
- Existing `docs/AMS_GMAIL_OAUTH_READINESS.md` recorded on **Oct 9**: primary and secondary token refresh, isolated read/checkpoint/dedup PASS; real owner inbox alerts observed but not fully correlated to durable backend receipts. Historical Google Console audience **External / In production**, **three lifetime users**; `gmail.send` and `gmail.readonly` not scope-verified. **Branding was NOT verified as of that audit.** Confirm the current state in the official Console; neither old screenshots nor website domain verification prove Google OAuth branding approval.
- Stacked Draft [PR #275](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/275): primary owner grant natural-refresh PASS Oct 20; AMS-origin campaign-worker/send-inbox acceptance still HOLD for missing authentic completed owner generation record. Do not fabricate generation provenance or enable campaigns. This is separate from `Resend`.
- Existing [Stripe paid TEST audit acceptance](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300#issuecomment-6484887604) and [branded Resend provider + real inbox delivery acceptance](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300#issuecomment-6485595907): PASS. **Do not re-run** or confuse the Resend message with Google Gmail OAuth scope approval; Production Stripe/customer sending remains separately gated.

## Recorded user-facing justification — review before provider submission

- Primary: `openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send`. `gmail.readonly` is **restricted**; `gmail.send` is **sensitive**. Primary mailbox monitors selected business/payment/security/Google Play inquiries; primary send is only for explicitly authorized owner alerts and narrowly permitted first-contact acknowledgments. Automatic replies are OFF.
- Secondary: `openid email https://www.googleapis.com/auth/gmail.readonly` only; **no `gmail.send`**. Monitoring-only, kept isolated from primary.
- `gmail.metadata` is **also restricted**, and the current Gmail API `q` search cannot use that scope. Do not blindly downscope and break the existing bounded search.
- Historic Google Console feature category was saved as **Email reporting and monitoring**. Saved rationale is in `docs/AMS_GMAIL_OAUTH_READINESS.md`; compare it to actually deployed functionality, not just text.
- Policy mismatch requiring a conscious decision before submission: published `app/privacy/page.tsx` says owner Gmail data is **not used for marketing campaigns**; #275 contains a **separately disabled owner-only email campaign pilot** using the same primary Gmail send grant. Keep #275 OFF until its purpose and policy are reconciled. Do not represent the owner pilot as already approved public Gmail marketing. Customer transactional delivery uses the independently verified Resend business sender, not personal Gmail Send-As.
- The public Privacy page accurately states that **there is no in-product Gmail disconnect/delete control**; owner may revoke via Google and request verified manual data deletion. `docs/AMS_GMAIL_MANUAL_DELETION.md` documents the operator process. Do not claim a self-service delete button exists.

## Existing proof assets — do not misrepresent

- HeyGen account has two completed videos titled **Aspect Marketing Solutions — Google OAuth Verification Demo**: IDs `b38b9aa7413146afb5914a0da4d66f04` (137 s) and `c6a9cafd87b94d188aafc06830056623` (153 s). Both videos' scene scripts explicitly say that mockup screens are demonstrations and **not** a live OAuth consent event. They may serve as explanatory supplements, **not** the sole proof of actual Google consent, app login or mailbox use. Use their stable HeyGen video pages if needed, not signed/expiring CDN links.
- Prior owner browser/screen recordings for actual primary and secondary OAuth flows were reported in earlier work. **Their current accessible original file/video and adequacy have not been verified in this checkpoint.** Prefer genuine unedited owner browser capture of current app and Google consent screens (with secrets, messages and tokens protected).
- GitHub audit documented owned domain's Search Console verification and publicly linked home/privacy/terms. Before submission independently open the live URLs and verify every page is accessible without authentication; web crawler failure alone is not evidence of a 404.

## Highest-priority browser/console actions — EXISTING project ONLY

1. In signed-in **connected Chrome Work**, select the exact project via:
   - [Google Auth Branding](https://console.cloud.google.com/auth/branding?project=aspect-marketing-solutions)
   - [Audience](https://console.cloud.google.com/auth/audience?project=aspect-marketing-solutions)
   - [Clients](https://console.cloud.google.com/auth/clients?project=aspect-marketing-solutions)
   - [Data Access](https://console.cloud.google.com/auth/data-access?project=aspect-marketing-solutions)
   - [Verification Center](https://console.cloud.google.com/auth/verification?project=aspect-marketing-solutions)
   Record exact displayed **branding publication/verification status**, consent audience/publishing status, data-access/verification status, and any actionable Google reviewer message with date. These URLs are navigation aids; validate the visible Console instead of inferring a status from a link.
2. Review every assigned OAuth client (including legacy `YouTube Upload`) and registered exact callbacks, separating AMS NextAuth login from Gmail primary/secondary. Preserve existing redirects and credentials; do not reset OAuth, remove clients or create a project. Review the anomalous bare redirect only; no deletion without approval.
3. Review declared scopes and minimum-privilege claims against the current source. Distinguish the **owner-only** two known Gmail accounts from AMS's **public SaaS** user login: this determines whether Google could apply a personal-use/few-personally-known-users exception or require full verification. Do **not** assume that External/In production or the 100-user unverified cap establishes approval.
4. If console shows branding not published/verified, complete required details and verify/publication through Google's official controls **only after reviewing changes**. Do not report approval before Google confirms it. Confirm existing owned-domain homepage, exact OAuth privacy/terms links, support contact and developer contact.
5. If sensitive/restricted scope review is required, prepare current Google-required submission rationale per scope, evidence of Limited Use, screen-recording demonstrating *actual* owner sign-in, real Google consent scopes, separate primary and secondary grants, live allowed feature use and realistic deletion/revocation path. Review Google account selectors without exposing credentials, tokens, private message content, client secrets or private mailbox data.
6. Assess Google's **restricted-scope security assessment** requirement before any paid commitment. Third-party server handling of restricted Gmail data may require yearly approved external assessment; do not promise free approval or authorize assessment fees. Obtain exact scope/exception decision first.
7. Keep `AMS_GMAIL_POLICY_APPROVED`, any consumer/campaign release gate, automatic replies and public customer Gmail grants OFF. No merge, Production change, billing, permission widening, test email, or scheduled task migration without distinct owner approval. Preserve all 27 ChatGPT task states.

## Reviewer recording checklist

Capture the real live app (not AI mockups); visible public homepage/privacy/terms and owner login; exact Google Console project/client (client ID may be shown only if safe; no client secret); primary OAuth consent and scope list; connected primary owner dashboard and one metadata-only monitoring result; separate secondary OAuth consent/connected read-only result; where the owner sees status, can revoke in Google Account, and can request manual deletion; explicit default-OFF sending and restricted email behavior. For scope inclusion across the project, document the other OAuth client as Google requests. Do not manufacture a token refresh or create an unnecessary new consent grant just for filming when existing grants can be demonstrated.

## Outcome recording

A Work report must distinguish: `CONSOLE_STATUS_READ`, `EXCEPTION_ELIGIBILITY_UNRESOLVED/CONFIRMED_BY_GOOGLE`, `BRANDING_SUBMITTED/PUBLISHED`, `DATA_ACCESS_SUBMITTED/APPROVED`, `VIDEO_EVIDENCE_COMPLETE/INCOMPLETE`, and `PRODUCTION_GMAIL_STILL_OFF`. Include official Google case/reference if submitted, review timestamps, minimal redacted screenshots, and remaining owner actions. **No status is presumed PASS without actual Cloud Console or Google response.**

## Primary Google policy references (reviewed Oct 28, 2026)

- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/identity/protocols/oauth2/policies
- https://support.google.com/cloud/answer/15544987
