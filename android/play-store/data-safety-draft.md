# Google Play Data Safety — Draft for Android v2.0.0

This document is a release-preparation draft based on the current `android/play-v1` source. It must be reconciled with the exact Google Play Console questionnaire at submission time. Do not copy answers blindly if the app code or connected SDKs change.

## Current app architecture

- Native Android Activity
- No advertising SDK
- No analytics SDK
- No authentication SDK
- No payment SDK
- No embedded WebView
- No account creation
- Internet permission and network-state permission only
- One HTTPS GET request to the public AMS health endpoint
- Optional external intents for the public privacy policy and support email

## Data collection / sharing assessment

### Location
- Approximate location: Not collected by app code
- Precise location: Not collected

### Personal info
- Name: Not collected by Android app
- Email address: Not collected by Android app
- User IDs: Not collected by Android app
- Address: Not collected
- Phone number: Not collected
- Race / ethnicity: Not collected
- Political / religious beliefs: Not collected
- Sexual orientation: Not collected
- Other personal info: Not collected by Android app

### Financial info
- User payment info: Not collected
- Purchase history: Not collected by Android app
- Credit score: Not collected
- Other financial info: Not collected

### Health and fitness
- Health info: Not collected
- Fitness info: Not collected

### Messages
- Emails: Not collected
- SMS/MMS: Not collected
- Other in-app messages: Not collected

### Photos and videos
- Photos: Not collected
- Videos: Not collected

### Audio files
- Voice/sound recordings: Not collected
- Music/audio files: Not collected
- Other audio: Not collected

### Files and documents
- Not collected

### Calendar
- Not collected

### Contacts
- Not collected

### App activity
- App interactions: No dedicated analytics collection in app code
- In-app search history: Not collected
- Installed apps: Not collected
- Other user-generated content: Not collected
- Other actions: Not collected by app code

### Web browsing
- Not collected by app code

### App info and performance
- Crash logs: No crash-reporting SDK in app code
- Diagnostics: No dedicated diagnostics SDK in app code
- Other app performance data: Not collected by app code

### Device or other identifiers
- No advertising ID, Firebase installation ID, or custom device identifier is read or stored by app code.

## Network / hosting note

When the app calls `https://www.aspectmarketingsolutions.app/api/health`, normal internet infrastructure may process connection metadata such as IP address, timestamp, HTTP headers, and user-agent for delivery, security, and operational logging. The public AMS privacy policy discloses this. Before Play submission, confirm whether Google Play's current Data Safety definitions require any of this server-side transient/log processing to be declared as collected.

## Sharing

The Android app contains no code that intentionally sends personal or sensitive user data to third parties. Normal network delivery uses AMS hosting infrastructure.

## Security practices

- Data in transit: HTTPS only
- Cleartext traffic: disabled in Android manifest
- User account deletion: Not applicable to Android v2.0.0 because the app does not create an Android account

## Sensitive permissions

None requested. The manifest currently requests only:

- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`

## Re-review trigger

Re-do this assessment before release if any of the following are added:

- Google/Firebase authentication
- Play Billing
- analytics or crash SDKs
- push notifications
- camera/photo upload
- location
- microphone/audio
- account creation
- device identifiers
- embedded browser/WebView behavior
