# AMS Google Play Release Gate — 2026-09-11

Status legend: `[x]` verified in code/CI or prior Play evidence; `[ ]` still requires a fresh local/Play Console verification.

## Current launch truth

The Android codebase is in `main`. The old `android/play-v1` branch is historical and is more than 200 commits behind `main`; do not build a release from that branch.

Google Play requires new Android phone/tablet apps and updates submitted after August 31, 2026 to target Android 16 / API 36 or higher. AMS already targets API 36.

For personal Play developer accounts created after November 13, 2023, production access requires a closed test with at least 12 testers continuously opted in for at least 14 days. Play Console is authoritative for whether this requirement applies to the AMS account and whether the testing threshold has been met.

## App identity

- [x] Google Play application ID: `com.aspectmarketingsolutions.app`
- [x] App name: Aspect Marketing Solutions
- [x] Version name: `2.0.0`
- [x] Version code: `20000`
- [x] compileSdk 36
- [x] targetSdk 36
- [x] minSdk 24
- [x] Android source aligned to the existing Play Console package identity

## Build and policy boundary

- [x] Native Android implementation; no legacy embedded WebView
- [x] HTTPS-only network behavior
- [x] No unapproved sensitive permissions
- [x] No in-app Stripe/payment links
- [x] Consumption-only Play v2.0.0 boundary
- [x] CI verifies package identity, API 36, app label, APK generation, and AAB generation
- [x] CI deliberately keeps repository artifacts unsigned so private signing material never enters GitHub
- [ ] Produce a fresh signed release AAB with the replacement upload key
- [ ] Install-test a release candidate on a physical Android device

## Signing — Windows release path

The repository contains `android/play-store/AMS-Sign-Play-Release.ps1`. It is designed to run on the owner's Windows machine and does not contain or print the keystore password.

Expected local signing identity:

- Alias: `ams-upload-2026b`
- Expected upload certificate SHA-1: `32:48:3E:C2:E4:3F:6B:52:7B:27:21:0D:6B:A1:F0:00:55:35:45:C0`
- Default keystore location: `C:\Users\white\Documents\AMS-Signing\aspect-marketing-solutions-upload-2026b.jks`
- Windows Credential Manager target: `AMS Google Play upload keystore 2026b`
- Output: `C:\Users\white\Documents\AMS-Signing\AMS-Android-2.0.0-PLAY-READY.aab`

The helper fails closed unless the unsigned AAB has the exact AMS package/version/API values and the keystore certificate matches the expected SHA-1. After signing it cryptographically verifies the bundle, re-checks manifest identity, extracts the R8 mapping, computes SHA-256 hashes, and writes a verification report.

- [ ] On the Windows machine, confirm the keystore file exists at the expected path
- [ ] Confirm the Windows Credential Manager entry still exists; do not copy the secret into chat or GitHub
- [ ] In Play Console > App integrity / App signing, confirm the active upload-key SHA-1 matches the expected SHA-1 above
- [ ] Download/copy the fresh unsigned API-36 AAB to `AMS-Signing` or Downloads as `AMS-Android-2.0.0-target36-UNSIGNED.aab`
- [ ] Run the signing helper from PowerShell
- [ ] Confirm the generated verification report says `Cryptographic verification: PASSED`
- [ ] Keep the private `.jks` and password off GitHub, chat, Drive shares, and public file stores
- [ ] Never replace the Google-managed app-signing key; only the upload key is involved here

## Play Console release

- [x] Play App Signing was previously confirmed enabled
- [x] AMS package identity was previously confirmed in the existing Play app record
- [ ] Freshly confirm the replacement upload key is active before upload
- [ ] Create or open the Closed testing release for `com.aspectmarketingsolutions.app`
- [ ] Upload `AMS-Android-2.0.0-PLAY-READY.aab`
- [ ] Resolve all Play Console validation errors/warnings that block rollout
- [ ] Save release notes and roll out to the closed-testing track
- [ ] Capture the official tester opt-in URL
- [ ] Configure the official URL into AMS (`AMS_ANDROID_CLOSED_TEST_URL`) rather than fabricating a link

## Testing

- [x] AMS tester recruitment funnel and owner roster exist
- [ ] Use Play Console to confirm whether the 12-testers / 14-days requirement applies to this developer account
- [ ] If it applies, recruit at least 12 qualifying testers; AMS operational target remains 18 for dropout buffer
- [ ] Keep at least 12 qualifying testers continuously opted in for at least 14 days
- [ ] Install and exercise the Play-delivered build on real Android hardware
- [ ] Verify platform-health request works
- [ ] Verify privacy/support links
- [ ] Verify no purchase flow appears in v2.0.0
- [ ] Review tester feedback and address material defects before production-access application

## Store listing / App content

- [x] Store listing copy drafted in this repository
- [x] Data Safety draft exists
- [x] Play Console answer guide exists
- [x] Production privacy policy is public at `https://www.aspectmarketingsolutions.app/privacy`
- [ ] Reconcile Data Safety answers against the exact shipping AAB
- [ ] Confirm ads declaration
- [ ] Confirm App access declaration
- [ ] Confirm target audience / age groups
- [ ] Confirm content rating is complete
- [ ] Confirm final 512×512 app icon
- [ ] Confirm 1024×500 feature graphic
- [ ] Capture required phone screenshots from the actual release candidate
- [ ] Confirm category and tags

## Production gate

Do not apply for production access or start production rollout until:

1. the signed AAB is accepted by Play,
2. the Play-delivered closed-test build has been install-tested,
3. all applicable closed-testing requirements are satisfied in Play Console,
4. App content / Data Safety / listing requirements are complete, and
5. no blocking pre-launch or policy findings remain.

## Deliberate non-goals for v2.0.0

- Play Billing
- SaaS subscription purchase inside Android
- Google account sign-in inside Android
- customer agent execution inside Android
- camera/file upload
- push notifications

Those are future releases. The first Play release stays narrow, truthful, and policy-safe.
