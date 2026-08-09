# AMS Google Play Release Gate

Status legend: `[x]` verified in code/CI, `[ ]` owner/Play Console action or verification still required.

## App identity

- [x] Preserve recovered application ID: `com.aspectai.webview`
- [x] App name: Aspect Marketing Solutions
- [x] Version name: `2.0.0`
- [x] Version code: `2026080901`
- [x] compileSdk 36
- [x] targetSdk 36
- [x] minSdk 24
- [ ] Confirm `com.aspectai.webview` is the package registered in the existing Play Console app before production upload

## Build quality

- [x] Native Android implementation; no legacy embedded WebView
- [x] HTTPS-only network behavior
- [x] No sensitive permissions
- [x] No in-app Stripe/payment links
- [x] Consumption-only Play v1 boundary
- [ ] Android Play CI green
- [ ] Release AAB produced and inspected
- [ ] Release APK produced for device smoke testing
- [ ] Physical-device smoke test completed

## Signing

- [x] Recovered 2025 source archive inspected for signing material
- [x] No keystore/upload key found in recovered source
- [ ] Open existing app in Play Console and confirm Play App Signing status
- [ ] Confirm current upload certificate fingerprint
- [ ] Locate existing upload key OR request an upload-key reset through Play Console if the key is lost
- [ ] Add release signing to CI only after the existing Play signing identity is confirmed
- [ ] Never replace the registered package/signing identity casually

## Policy and privacy

- [x] Public privacy route exists in source
- [ ] Verify expanded privacy policy is live at `https://www.aspectmarketingsolutions.app/privacy`
- [x] Draft Data Safety assessment prepared from current source
- [ ] Complete the current Play Console Data Safety questionnaire and reconcile every answer against the shipping build
- [ ] Complete target audience / age group declaration
- [ ] Complete content rating questionnaire
- [ ] Declare ads: No, assuming no ad SDK is added
- [ ] Complete App access section; current v1 has no login/restricted content
- [ ] Review developer-verification/package-registration requirement before the September 30, 2026 deadline

## Store listing

- [x] App name drafted
- [x] Short description drafted
- [x] Full description drafted
- [x] Release notes drafted
- [x] Website and support contact drafted
- [x] Privacy policy URL drafted
- [ ] Final high-resolution app icon (512×512 PNG)
- [ ] Feature graphic (1024×500)
- [ ] At least required phone screenshots from the actual Android build
- [ ] Optional tablet screenshots if tablet distribution is enabled
- [ ] Confirm category and tags in Play Console

## Testing and publication

- [ ] Confirm whether this developer account is subject to required closed-testing criteria before production access
- [ ] Upload signed AAB to the appropriate first track
- [ ] Resolve every Play pre-launch report blocker
- [ ] Test install from Play-delivered build, not only local APK
- [ ] Verify live platform-health request works in Play-delivered build
- [ ] Verify privacy/support buttons
- [ ] Verify no purchase flow is available in Android v2.0.0
- [ ] Promote only after Play Console reports the release eligible for rollout

## Deliberate non-goals for v2.0.0

- Play Billing
- SaaS subscription purchase inside Android
- Google account sign-in inside Android
- customer agent execution inside Android
- camera/file upload
- push notifications

These are future releases. The first Play release is designed to be useful, truthful, policy-safe, and shippable without turning an unfinished SaaS execution path into an app-store blocker.
