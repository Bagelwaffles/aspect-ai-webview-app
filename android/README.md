# Aspect Marketing Solutions Android — Play v1

This directory is the modern Android replacement for the July 2025 `Aspect AI-source.zip` project recovered from the AMS Google Drive archive.

## Authoritative Play identity

- Google Play application ID / package: `com.aspectmarketingsolutions.app`
- App name: `Aspect Marketing Solutions`
- Version code: `20000`
- Version name: `2.0.0`

The recovered July 2025 source used the obsolete package `com.aspectai.webview`, but the existing Google Play Console app record for Aspect Marketing Solutions is registered as `com.aspectmarketingsolutions.app`. The Play Console record is authoritative for this release, so the modern Android project now uses that exact package identity.

The recovered project also targeted API 34 and loaded `https://aspect-ai.web.app` in an embedded WebView with file access and mixed-content compatibility enabled. Those legacy behaviors are intentionally not carried forward.

## Play v1 product boundary

The first Play build is intentionally **consumption-only**:

- no in-app purchases
- no Stripe links
- no subscription purchase flow
- no ads
- no account creation
- no camera, microphone, contacts, location, storage, SMS, or call-log permissions
- no embedded WebView

The app provides native platform-health reporting, a truthful launch-agent status view, privacy access, and support contact. This keeps the first release useful while avoiding a fake wrapper and avoiding external-payment policy conflicts.

## Build baseline

- compileSdk 36
- targetSdk 36
- minSdk 24
- Android Gradle Plugin 9.3.1
- Gradle 9.5.0 in CI
- JDK 17

## Signing

Google Play Console confirms Play App Signing is enabled for `com.aspectmarketingsolutions.app` and shows an existing upload-key certificate. The recovered source, Gmail, and Drive search did not recover the corresponding private upload keystore. The safe release path is therefore to generate a new upload key, request an upload-key reset in Play Console, keep the new private keystore secure, and use only its public certificate for the reset request.
