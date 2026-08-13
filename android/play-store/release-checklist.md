# AMS Google Play Release Gate

Status legend: `[x]` verified in code/CI/Play Console, `[ ]` owner/Play Console action or verification still required.

## App identity

- [x] Google Play application ID confirmed: `com.aspectmarketingsolutions.app`
- [x] App name: Aspect Marketing Solutions
- [x] Version name: `2.0.0`
- [x] Version code: `20000`
- [x] compileSdk 36
- [x] targetSdk 36
- [x] minSdk 24
- [x] Android source aligned to the existing Play Console package identity

## Build quality

- [x] Native Android implementation; no legacy embedded WebView
- [x] HTTPS-only network behavior
- [x] No sensitive permissions
- [x] No in-app Stripe/payment links
- [x] Consumption-only Play v1 boundary
- [x] Android Play CI green after package-identity correction
- [x] Unsigned release AAB produced by CI after package-identity correction
- [x] Release package identity verified by CI as `com.aspectmarketingsolutions.app`
- [ ] Signed release AAB produced after replacement upload key activates
- [ ] Release APK produced for physical-device smoke testing
- [ ] Physical-device smoke test completed

## Signing

- [x] Play App Signing confirmed enabled in Play Console
- [x] App-signing key certificate visible in Play Console
- [x] Existing upload-key certificate visible in Play Console
- [x] Play Console exposes `Request upload key reset`
- [x] Recovered 2025 source archive inspected for signing material
- [x] No corresponding private upload keystore recovered from source, Gmail, or Drive
- [x] New private upload keystore generated locally at `C:\AMS_Play_Signing\ams-upload-key.jks`
- [x] New public upload certificate exported locally at `C:\AMS_Play_Signing\upload_certificate.pem`
- [x] Upload-key reset requested in Play Console using the new public certificate
- [ ] Confirm replacement upload key is active in Play Console on/after August 15, 2026
- [ ] Configure release signing without committing the private keystore or password
- [ ] Never change the Google-managed app-signing key for this recovery

## Policy and privacy

- [x] Public privacy route exists in source
- [x] Privacy policy live at `https://www.aspectmarketingsolutions.app/privacy`
- [x] Draft Data Safety assessment prepared from current source
- [x] Play Console answer guide prepared from current source in `play-console-answers.md`
- [ ] Complete the current Play Console Data Safety questionnaire and reconcile every answer against the shipping build
- [ ] Complete target audience / age group declaration
- [ ] Complete content rating questionnaire
- [ ] Declare ads: No, assuming no ad SDK is added
- [ ] Complete App access section; current v2.0.0 has no login/restricted content

## Store listing

- [x] App name drafted
- [x] Short description drafted
- [x] Full description drafted
- [x] Release notes drafted
- [x] Website and support contact drafted
- [x] Privacy policy URL drafted
- [ ] Final high-resolution app icon (512×512 PNG)
- [ ] Feature graphic (1024×500)
- [ ] Required phone screenshots from the actual Android build
- [ ] Optional tablet screenshots if tablet distribution is enabled
- [ ] Confirm category and tags in Play Console

## Testing and publication

- [x] AMS tester recruitment funnel and owner roster are live
- [ ] Create/prepare the Google Play closed-testing track
- [ ] Configure the official Play closed-test opt-in URL in AMS
- [ ] Recruit at least 12 qualifying testers; AMS operational target is 18 for buffer
- [ ] Keep at least 12 qualifying testers opted in continuously for 14 days, using Play Console as the source of truth
- [ ] Upload the signed AAB to the closed-testing track
- [ ] Resolve every Play pre-launch report blocker
- [ ] Test install from Play-delivered build, not only local APK
- [ ] Verify live platform-health request works in Play-delivered build
- [ ] Verify privacy/support buttons
- [ ] Verify no purchase flow is available in Android v2.0.0
- [ ] Apply for production access only after Play Console reports eligibility

## Deliberate non-goals for v2.0.0

- Play Billing
- SaaS subscription purchase inside Android
- Google account sign-in inside Android
- customer agent execution inside Android
- camera/file upload
- push notifications

These are future releases. The first Play release is designed to be useful, truthful, policy-safe, and shippable without turning an unfinished SaaS execution path into an app-store blocker.
