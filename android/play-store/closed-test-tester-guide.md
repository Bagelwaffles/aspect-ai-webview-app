# AMS Android Closed-Test — Tester Guide

This guide is for invited testers after the official Google Play closed-test opt-in URL is live.

## What testers need

- An Android phone or tablet compatible with the Play release
- A Google Account that can access Google Play
- The exact Google Account email added to the AMS closed test or eligible Google Group
- Willingness to remain opted in for the full closed-test window

## Join the test

1. Open the official AMS Google Play closed-test opt-in link while signed into the invited Google Account.
2. Choose the option to become a tester.
3. Open the Google Play listing presented after opt-in.
4. Install Aspect Marketing Solutions from Google Play.

If Google says the account is not eligible, confirm that the Google Account currently signed into Play is the same account invited to the test.

## What to test

Use the app normally and check these release-specific behaviors:

- App launches without crashing.
- The app identifies itself as Aspect Marketing Solutions.
- Platform status can be refreshed.
- A healthy production response is shown as online/ready rather than a fabricated status.
- Agent lifecycle labels clearly distinguish Beta and In Development capabilities.
- Privacy Policy opens correctly.
- Email Support opens the device's email handler when available.
- There is no subscription purchase, Stripe checkout, external payment button, advertising flow, account-creation flow, or request for camera, microphone, contacts, location, SMS, call-log, or storage permissions in this release.
- Text and controls fit the screen without clipping or unusable overflow.

## Feedback that helps

Report:

- device model
- Android version
- whether install succeeded
- whether the app launched
- what action caused any crash or freeze
- screenshots of visual defects when possible
- exact wording of any confusing status message
- whether the Privacy Policy and Support buttons worked

Never send passwords, payment details, authentication codes, private keys, or other secrets in feedback.

## Staying in the test

If this app is subject to Google's newer personal-account production gate, Google requires at least 12 testers to remain opted in continuously for at least 14 days before production access can be requested. Testers should not opt out during the agreed test period unless they need to stop participating.

The AMS recruitment roster does not determine Google's eligible-tester count. Google Play Console is the source of truth.

## Scope of this beta

This first Play release is a native, consumption-only companion focused on platform status and the verified AMS Agent Network lifecycle. It is not yet the full customer execution surface for every AMS agent.
