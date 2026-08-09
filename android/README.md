# Aspect Marketing Solutions Android — Play v1

This directory is the modern Android replacement for the July 2025 `Aspect AI-source.zip` project recovered from the AMS Google Drive archive.

## Preserved identity

- Application ID / package: `com.aspectai.webview`
- App name: `Aspect Marketing Solutions`
- Version code: `2026080901`
- Version name: `2.0.0`

The recovered project also used `com.aspectai.webview`, but targeted API 34 and loaded `https://aspect-ai.web.app` in an embedded WebView with file access and mixed-content compatibility enabled. Those legacy behaviors are intentionally not carried forward.

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

The recovered 2025 archive contained no `.jks`, `.keystore`, `.p12`, `.pem`, or `.key` signing material. Release signing must therefore be resolved against the existing Play Console app record before production upload. Do not invent or replace a signing key until Play App Signing / upload-key status is confirmed.
