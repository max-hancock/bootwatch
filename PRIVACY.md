# BootWatch Privacy Policy

_Last updated: April 23, 2026_

BootWatch ("we", "our", "the app") is a community-powered parking-boot tracker for apartment complexes in Rexburg, Idaho. This policy explains what data the app collects, why, and how it is used.

Contact: **maxhancock64934@gmail.com**

## Summary

- We collect the minimum data needed for the app to work: your account info, your device location while you use the map, push notification tokens, and anonymous reports you choose to submit.
- We do not sell your data.
- We do not show ads.
- You can delete your account and associated data at any time from within the app.

## What we collect

### Account information

When you create an account, we collect:

- **Email address** — used as your login identifier and for password reset. Provided by you directly, or shared by Apple / Google when you use Sign in with Apple or Sign in with Google.
- **Display name (optional)** — a name you choose to show on your sighting reports. You can leave this blank to stay anonymous.
- **Avatar** — a colored avatar with your initial, or an optional profile photo you upload. A profile photo is shown publicly next to your name (feed, Ranks, profile card). No personal photo is required.

Sign in with Apple may return a private relay email (`@privaterelay.appleid.com`) instead of your real email; that is fully supported.

### Location data

- **Precise device location** is requested when you open the map so we can show your position and provide proximity-based features (e.g. alerts when a boot is spotted near you).
- Location is only used while the app is in the foreground. We do not collect background location.
- Your precise coordinates are **not** stored on our servers; they are used on your device only. If you enable nearby-sighting notifications, we store only the complex you are associated with, not your raw coordinates.

### Push notification tokens

- If you grant notification permission, the app stores an anonymized push token so we can deliver parking-timer alerts and nearby-sighting alerts.
- Push tokens are tied to your account and removed on sign-out or account deletion.

### Sighting reports

When you submit a sighting (a report that enforcement is active at a complex), we store:

- The complex you selected
- Timestamp
- Optional short text note
- Optional photo (see "Photos" below)
- A link to your account ID so you can delete your own reports; the report itself appears anonymously to other users unless you opt to show your display name.

### Photos

- If you attach a photo to a sighting, it is uploaded to our backend and shown in the public sightings feed.
- The app only accesses photos you explicitly pick via the iOS/Android photo picker, or take with the camera when filing a report. We do not scan your photo library.
- **Reporting photos**: you can report a sighting photo or profile photo. We store who reported it, the photo, the reason and the time, so we can review it. A photo reported by more than one person is hidden until reviewed; photos that break the rules are deleted. Reporters are never shown to the photo's owner.

### Diagnostic and crash data

- We use **Sentry** to collect crash reports and performance diagnostics so we can fix bugs.
- Crash reports include device model, OS version, app version, and a stack trace. They do not include your email, location, or personal content.

### Information we do NOT collect

- We do not collect contacts, microphone, camera (beyond photos you choose to take or pick for a report or profile), health data, financial data, browsing history, or any advertising identifiers.
- We do not use third-party analytics or advertising SDKs.

## How we use data

- **Operate the app**: show the map, deliver notifications, attribute your sightings so you can edit/delete them.
- **Maintain security**: authenticate your account, prevent abuse.
- **Fix bugs**: read crash diagnostics from Sentry.

We do not sell, rent, or trade personal data.

## Third-party services

| Service | Purpose | Data shared |
|---|---|---|
| Supabase | Backend database, authentication, storage | Account info, sightings, push tokens, photos |
| Apple Push Notification Service | Delivering iOS notifications | Push token, notification payloads |
| Google Firebase Cloud Messaging | Delivering Android notifications | Push token, notification payloads |
| Sign in with Apple | Optional sign-in method | Email (real or private relay), name |
| Google Sign-In | Optional sign-in method | Email, name, profile picture URL |
| Google Maps (Android) | Displaying the map on Android | Device location (processed on-device by Google Maps SDK) |
| Sentry | Crash and error reporting | Device model, OS version, app version, stack traces |

Each of these providers has its own privacy policy. BootWatch is not responsible for their practices.

## Data retention

- Account data and sightings are retained while your account exists.
- Crash reports in Sentry are retained for 30 days.
- Push tokens are removed on sign-out.

## Deleting your data

You can delete your account at any time from **Profile → Delete Account** inside the app. Deletion removes your email, display name, avatar, push tokens, sightings, and photos from our servers within 30 days.

You can also email **maxhancock64934@gmail.com** to request deletion.

## Children's privacy

BootWatch is not directed at children under 13. We do not knowingly collect personal data from anyone under 13. If you believe a child has provided us personal data, email us and we will delete it.

## Your choices

- **Location**: you can revoke location permission in iOS/Android settings at any time. Map features will still work but won't show your position or proximity alerts.
- **Notifications**: you can disable notifications in iOS/Android settings. Timer and nearby-sighting alerts will stop.
- **Photos**: always optional when filing a sighting.
- **Display name**: leave blank to post anonymously.

## Changes to this policy

If we make material changes, we will update the "Last updated" date at the top and, where appropriate, notify users in the app.

## Contact

Questions or data requests: **maxhancock64934@gmail.com**
