# BootWatch — MVP & Growth Plan

## The Problem

Rexburg, ID is a college town with 20,000+ students living across dozens of apartment complexes. Visitor parking is extremely limited and aggressively enforced by booting companies that profit from students going even a few minutes over time. Getting booted is expensive, stressful, and universally hated. No one is building a solution for this.

## The Opportunity

- **Concentrated market**: 20,000+ students in a small geographic area — word of mouth spreads fast
- **Emotional trigger**: Getting booted is infuriating and costly. Frustration drives downloads and sharing
- **Recurring problem**: Students deal with parking daily across multiple semesters
- **Underserved niche**: No existing product addresses this problem

## The Product

**BootWatch** is a mobile app that helps Rexburg students avoid getting booted through parking timers, real-time boot truck sightings, and community-driven risk data.

### Core Value Proposition

*"Never get booted in Rexburg again."*

---

## MVP Features (Priority Order)

### P0 — Launch Features

#### 1. Complex Directory (Content Foundation)
A curated, manually-researched database of Rexburg apartment complexes including:
- Visitor parking time limits
- Which booting company patrols the complex
- Signage quality (well-marked vs. sneaky/hidden)
- Community risk rating (updated over time with user reports)

> **Why P0**: This gives the app content on day one with zero user-generated data. It is the foundation that the timer and heat map build on. Requires an afternoon of local research to seed — this is our unfair advantage.

#### 2. Parking Timer with Push Notifications
- User selects their complex (or GPS auto-detects nearby complexes)
- Timer auto-sets based on that complex's known visitor parking limit
- Push notifications at 10 minutes, 5 minutes, and expiration
- Option to set a custom timer if the complex isn't listed yet
- "I'm leaving" button to cancel the timer

> **Why P0**: This is the only feature that delivers value with zero other users. It is the reason someone downloads and keeps the app. A phone's built-in timer doesn't know complex-specific rules — BootWatch does.

#### 3. Boot Spotter Feed with Push Alerts
- Users report a boot truck sighting: tap location + optional photo
- Live chronological feed: "Boot truck spotted at The Cove — 4 min ago"
- Users save their home complex + frequently visited spots
- Push notifications only for saved locations (avoids notification fatigue)
- Reports include timestamp, location, and optional photo evidence

> **Why P0**: This is the viral engine. A notification saying "Booter seen at The Grand!" gets screenshotted and shared in group chats. Works with even 5-10 active users.

### P1 — Post-Launch (Weeks 2-3)

#### 4. Risk Heat Map
- Map of Rexburg with colored pins/markers on each complex
- Color based on booting report density (red = high risk, yellow = moderate, green = safe)
- Starts simple with colored pins — upgrade to gradient heat map when data volume supports it

> **Why P1 and not P0**: A heat map requires accumulated community data to be meaningful. Empty heat maps look broken. Launch with the directory and feed first, then turn on the heat map once there are 30-50+ data points.

### P2 — Growth Features (Later)

| Feature | Description |
|---|---|
| Upvote/confirm sightings | Other users confirm a spotter report is still active |
| Boot dispute assistant | Photo evidence capture, Idaho booting law reference, template dispute letters |
| Historical stats | "The Cove had 43 boot reports this month" |
| P2P parking sharing | Students list their assigned spot as available when away |
| Apartment complex ratings | Rate and review complexes based on parking friendliness |

---

## Tech Stack

| Layer | Tool | Rationale |
|---|---|---|
| Frontend | Expo + React Native | Cross-platform (iOS + Android), great DX, built-in push notification support |
| Backend | Supabase | Free tier, real-time database for spotter feed, built-in auth, file storage for photos |
| Maps | React Native Maps | Complex locations, spotter pins, heat map visualization |
| Notifications | Expo Notifications | Simple push notification setup, works on both platforms |
| Deployment | EAS Build | Expo's managed build service for App Store and Google Play submissions |

**Cost at launch**: Effectively $0 on Supabase free tier. Scales affordably as user count grows.

---

## Monetization Strategy

### Phase 1 — Free (Launch)
All features free. Maximize downloads, retention, and community data.

### Phase 2 — Monetize (Once Traction Exists)
- **Premium tier**: Extended timer history, priority spotter alerts, ad-free experience
- **Business listings**: Apartment complexes pay to claim/update their listing (Yelp-for-parking model)
- **Local ads**: Rexburg businesses advertising to a captive student audience

---

## Go-To-Market Strategy

### Pre-Launch
- Manually research and seed the complex directory (drive around Rexburg, document every complex's parking rules)
- Recruit 20-30 friends as initial users to seed the spotter feed

### Launch
- Post in every Rexburg apartment Facebook group, Reddit, and BYU-I student forum
- Lead with the frustration: screenshots of spotter alerts, boot horror stories
- The anger does the marketing — students will share it because they already want to vent about booting

### Growth Loop
1. Student gets booted or hears about someone getting booted → frustration
2. Discovers BootWatch through a friend's share or social media post
3. Downloads the app, sets up parking timer → immediate value
4. Sees and contributes to the spotter feed → becomes an active user
5. Shares a spotter alert screenshot → brings in more users
6. More users = better data = better heat map = more value for everyone

---

## Key Risk: Cold Start

The spotter feed and heat map are only valuable with active users. Mitigation:
- The complex directory and parking timer work with zero users (day-one value)
- Seed initial data manually
- Launch with a small group of friends first to populate the feed
- The timer is the hook; the community features are the retention play

---

## Build Order

1. Scaffold Expo app with tab navigation
2. Complex directory + map screen (with seed data)
3. Parking timer with push notifications
4. Supabase backend + auth
5. Boot spotter feed + real-time updates
6. Spotter push notifications for saved complexes
7. Heat map visualization

---

*Last updated: March 9, 2026*
