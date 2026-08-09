# AMS Android Beta Recruitment Playbook

## Objective
Recruit **18 real Android testers** so AMS has a six-person buffer above Google's current minimum of 12 qualifying testers. For personal Play developer accounts created after November 13, 2023, Google's current rule requires at least 12 testers to remain opted in to a closed test for 14 consecutive days before the developer can apply for production access.

Official Google reference:
https://support.google.com/googleplay/android-developer/answer/14151465

## Operating rule
This is **recruitment, not sales**.

Do not ask testers to:
- buy AMS
- subscribe
- leave a five-star review
- pretend the app works
- post public praise

Ask them to:
- join with their Google account
- install the Play-delivered build
- stay opted in for the full test window
- use the app more than once
- submit honest private feedback

## Recruitment order

### 1. Warm contacts
Ask family, friends, past coworkers, customers, and anyone you already know who owns an Android device. They do not need to understand SaaS or marketing.

### 2. Reciprocal developer testing
Use legitimate developer/tester communities where real developers exchange testing help. Offer to test another developer's app in return. Do not purchase fake reviews, fake accounts, bot installs, or "guaranteed production access."

### 3. Business / Android communities
Post the public AMS tester page in relevant communities that allow beta-test requests. The CTA is the tester page, not the pricing page.

### 4. Existing AMS channels
Use the AMS website, legitimate social accounts, Fiverr profile/network where permitted, and direct outreach to recruit testers. Keep the ask simple.

## Public URL
Use this after the feature is deployed:

`https://www.aspectmarketingsolutions.app/android-beta`

Tester feedback:

`https://www.aspectmarketingsolutions.app/android-beta/feedback`

Owner roster:

`https://www.aspectmarketingsolutions.app/dashboard/android-beta`

## Ready-to-post recruitment message

### Short version
> I’m looking for Android users to help beta-test the Aspect Marketing Solutions app for Google Play. It’s free—no purchase and no public review required. I need people willing to join the closed test, keep it active for 14 days, use the app a few times, and send honest private feedback. If you can help, join here: https://www.aspectmarketingsolutions.app/android-beta

### Developer-community version
> Android beta tester exchange: I’m preparing Aspect Marketing Solutions for Google Play closed testing. I’m recruiting real Android users who can stay opted in for the full 14-day test period and give private feedback. No purchase and no review manipulation. I’m happy to return a legitimate test for another developer. Tester page: https://www.aspectmarketingsolutions.app/android-beta

### Direct-message version
> Hey — I’m trying to get my Android app through Google Play testing. Would you be willing to help me test it? It’s free. You’d install it through Google Play, stay opted in for 14 days, use it a few times, and tell me if anything is confusing or broken. No purchase and no public review needed. Here’s the tester page: https://www.aspectmarketingsolutions.app/android-beta

## Tester instructions after Play link exists
1. Join the AMS tester roster with the same Google email used on the Android device.
2. Open the official Google Play closed-test opt-in link.
3. Opt in.
4. Install the app from Google Play.
5. Stay opted in continuously for at least 14 days.
6. Use the app multiple times during the test.
7. Submit private feedback at `/android-beta/feedback`.
8. Do not opt out until AMS confirms the production-access application has been submitted.

## Feedback questions AMS should be able to answer for Google
- What did testers actually use?
- Which Android devices were represented?
- What confused testers?
- What bugs or usability issues were found?
- What did AMS change because of feedback?
- Why is the app ready for production now?

The private feedback form and owner dashboard are designed to preserve evidence for those answers.

## Source-of-truth rule
The AMS dashboard tracks **recruited leads and private feedback**. It must never claim that a tester qualifies for Google's 12/14 requirement based only on the AMS roster.

Only Google Play Console can confirm:
- who opted in
- how long they stayed opted in
- whether the closed test satisfies production-access eligibility

## Current blocker sequence
1. Confirm existing Play signing identity and upload key status.
2. Generate/upload the signed AAB to Closed testing.
3. Obtain the official Play closed-test opt-in URL.
4. Set `AMS_ANDROID_CLOSED_TEST_URL` in Vercel.
5. Recruit 18 testers.
6. Confirm at least 12 qualifying testers in Play Console for 14 continuous days.
7. Use real feedback to improve the app.
8. Apply for production access.
