# AMS Google Play — August 15 Execution Runbook

Purpose: make August 15, 2026 an execution day after the Google Play upload-key reset becomes active.

## Current verified identity

- App: Aspect Marketing Solutions
- Package: `com.aspectmarketingsolutions.app`
- Version: `2.0.0`
- Version code: `20000`
- targetSdk / compileSdk: `36`
- Play App Signing: enabled
- Replacement upload key: generated locally by the owner; private `.jks` must remain off GitHub and out of chat
- Replacement public certificate: submitted to Google Play for upload-key reset

## Do not do before the reset is active

- Do not upload a release AAB signed with the replacement upload key before Google Play says the reset is active.
- Do not commit the private keystore, keystore password, key password, or base64 form of the keystore.
- Do not use the legacy Pipedream APK builder as a release source. The recovered workflow generates placeholder graphics and stale WebView/Admin-PIN metadata and does not match the current native Play v2.0.0 build.

## Step 1 — Confirm upload-key reset is active

In Play Console:

1. Open Aspect Marketing Solutions.
2. Open App integrity / Play App Signing.
3. Confirm the Upload key certificate now matches the replacement certificate.
4. Record only the public SHA-256 fingerprint in release evidence.

Stop if Play still shows the old upload certificate.

## Step 2 — Sign the release bundle locally

Use the private keystore stored outside the repository. The signing configuration may be supplied to Gradle through local-only properties or environment variables. Never add signing secrets to tracked files.

Expected release artifact:

`android/app/build/outputs/bundle/release/app-release.aab`

Before upload, verify:

- package is exactly `com.aspectmarketingsolutions.app`
- version code is `20000` and is higher than every version already uploaded for this Play app
- version name is `2.0.0`
- target SDK is `36`
- release contains no WebView purchase surface, Stripe checkout, ads, account creation, or sensitive permissions

If Play reports version code `20000` already exists, increment the Android version code in source and rebuild; never overwrite or reuse a Play version code.

## Step 3 — Finish App content declarations

Use the shipping Android build as the source of truth.

Current release intent:

- Ads: No
- App access: All functionality in this Android release is available without login or restricted credentials
- Target audience: adults / business users; do not select child age groups unless the product scope changes
- Privacy policy: `https://www.aspectmarketingsolutions.app/privacy`
- Data Safety: reconcile against `android/play-store/data-safety-draft.md` before submission
- Content rating: answer the current IARC questionnaire based on the actual app content; do not guess a rating

Google requires the App content declarations to be completed before review and requires all developers to complete the Data Safety form. Google also requires a content rating questionnaire and target-audience declaration.

## Step 4 — Store listing

Use `android/play-store/listing.md` as the approved text baseline.

Required visual assets still need to be genuine assets from the shipping app, not placeholders:

- 512×512 app icon
- 1024×500 feature graphic
- required phone screenshots captured from the actual Play v2.0.0 app

Do not use placeholder files from the recovered Pipedream builder.

## Step 5 — Create the Closed testing release

In Play Console:

1. Test and release → Testing → Closed testing.
2. Create or open the AMS closed-testing track.
3. Upload the signed AAB.
4. Resolve every blocking Play validation message.
5. Add the tester list or Google Group.
6. Publish the closed-test release.
7. Copy the official Google Play opt-in URL.

For newer personal developer accounts, Google currently requires at least 12 testers opted in continuously for 14 days before production access can be requested. AMS operational target is 18 testers to provide buffer against drop-off.

## Step 6 — Connect the AMS recruitment system

After the official Play opt-in URL exists:

1. Set production `AMS_ANDROID_CLOSED_TEST_URL` to the exact Google Play opt-in URL.
2. Verify `https://aspectmarketingsolutions.app/android-beta` shows the real Play join action.
3. Verify the private owner dashboard records recruitment separately from Google Play opt-in status.
4. Do not claim a tester counts toward Google's requirement until Play Console shows the tester as opted in.

## Step 7 — Tester evidence and feedback

Track:

- opt-in date
- Play Console eligible tester count
- consecutive-day status shown by Google
- device / Android version when voluntarily supplied
- install success
- platform-status refresh behavior
- privacy button
- support button
- crashes, freezes, layout issues, or misleading lifecycle labels

The AMS roster is an operational recruitment aid. Google Play Console remains the authoritative source for the 12-tester / 14-day production-access requirement.

## Step 8 — Production-access application after the test gate

Do not apply until Play Console says the requirement is satisfied. Prepare truthful answers about:

- how testers were recruited
- what they tested
- feedback received
- defects found and fixed
- why the app is ready for production

Do not fabricate engagement or feedback.

## Release blockers that remain external

- Upload-key reset must be active in Google Play.
- A signed release bundle must be built with the replacement upload key.
- Real Play Store graphics/screenshots must exist.
- Closed test must be published and the official opt-in URL obtained.
- If this personal developer account is subject to the newer-account rule, at least 12 testers must stay opted in for 14 continuous days before production access can be requested.
