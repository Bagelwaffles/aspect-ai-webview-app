# Google Play Console Answers — Android v2.0.0

Prepared for package `com.aspectmarketingsolutions.app`. Reconfirm against the shipping AAB and the exact Play Console wording before final submission.

## App access

- Restricted access: No
- Login required: No
- Reviewer credentials: Not applicable

The Android v2.0.0 release is a public, consumption-only companion and does not create or require an AMS account.

## Ads

- Contains ads: No

There is no ad SDK or advertising surface in the Android v2.0.0 source.

## Target audience

Recommended target selection: adults only. Do not include child age groups unless the product is intentionally redesigned for children and reviewed against Google Play Families requirements.

Recommended positioning: business users, small-business owners, marketers, operators, and adults evaluating AMS platform status and agent availability.

## Content rating

Complete the IARC questionnaire using the actual app behavior. Current source contains no violence, sexual content, gambling, controlled substances, profanity features, user-generated social content, or unrestricted web browsing.

Do not guess the final rating; use the rating Play Console returns from the completed questionnaire.

## Data Safety

Current source assessment:

- No advertising SDK
- No analytics SDK
- No authentication SDK
- No payment SDK
- No account creation
- No sensitive permissions
- No user-entered personal data collection in the Android app
- HTTPS request to the public AMS health endpoint only

**Do not submit a blanket `No data collected` answer yet.** Google defines collection broadly as user data transmitted off-device. The health request necessarily reaches AMS hosting with connection metadata such as IP address and the explicit `AMS-Android/2.0` user-agent. If that metadata is only processed ephemerally to serve the request, Google provides special handling; if AMS/Vercel logs or uses it beyond the real-time request, the applicable data type and purpose must be disclosed. Confirm the actual production retention/use before submitting the Data Safety form.

The detailed source assessment is in `data-safety-draft.md`.

## Privacy policy

`https://www.aspectmarketingsolutions.app/privacy`

## Website

`https://www.aspectmarketingsolutions.app`

## Category

Recommended: Business

## Purchases / monetization

Android v2.0.0 is consumption-only:

- no in-app purchase
- no Play Billing
- no Stripe checkout
- no external payment link
- no subscription purchase flow

Web billing is outside this Play build.

## Closed testing

For a qualifying new personal Play developer account, production access requires a closed test with at least 12 testers opted in continuously for 14 days. AMS operational target: recruit 18 testers to provide a buffer above the minimum.

Testers must join with a Google Account or Google Workspace account through the official Play opt-in URL. The AMS recruitment roster does not replace Play Console's tester count or consecutive-day counter.

## Production-access application notes

When the 14-day requirement is satisfied, answer Google's production-access questions with evidence from the actual closed test:

- what testers did in the app
- feedback received
- defects found and corrected
- why the app is ready for production

Do not fabricate engagement, feedback, bugs, or fixes.
