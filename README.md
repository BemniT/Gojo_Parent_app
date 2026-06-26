# Gojo Parent App

A React Native mobile application built with Expo that connects parents to their children's schools — providing real-time access to attendance, grades, announcements, payments, and direct messaging with school staff.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Navigation](#navigation)
- [Architecture](#architecture)
- [Firebase Database Structure](#firebase-database-structure)
- [Authentication Flow](#authentication-flow)
- [State Management](#state-management)
- [Theming & Localization](#theming--localization)
- [Offline Support](#offline-support)
- [Build & Deployment](#build--deployment)

---

## Overview

Gojo Parent App is a cross-platform (iOS & Android) educational management platform that serves as a communication bridge between parents and schools. The app targets schools in Ethiopia, reflected in its multi-language support (English, Amharic, Oromo, and Tigrinya) and its local educational context.

Parents can log in, view their children's academic performance, track attendance, monitor school payments, receive school announcements, and chat directly with teachers and school management — all in real time via Firebase.

---

## Features

### Authentication
- Username/password login with school resolution via username prefix
- Parent role validation and account status checks
- Blocked account detection with school contact info display
- Persistent session management via AsyncStorage

### Home Feed
- School announcement and post feed with images
- Post interactions: like and report
- Offline action queuing (actions sync when connection is restored)
- Time-relative post timestamps

### Attendance Tracking
- Visual attendance statistics per child (present / late / absent)
- Circular progress indicators using React Native SVG
- Date range and child-based filtering

### Class Marks / Grades
- Grade display by subject and semester
- Assessment component breakdowns with weighted scoring
- Multi-child and multi-subject filtering

### School Management
- **Payments** — track payment status and due amounts
- **History** — view past payment transactions
- **Calendar** — browse school events and important dates

### Messaging
- Real-time chat with teachers and school staff
- Message threading with read status
- Image and media sharing via Expo Image Picker
- User directory filtered by role (children, management, teachers)

### Profile
- View and edit parent profile (bio, profile picture)
- View profiles of teachers and school staff
- Upload profile images to Firebase Cloud Storage

---

## Tech Stack

| Category | Technology |
|---|---|
| Framework | React Native + Expo |
| Routing | Expo Router (file-based) |
| Backend | Firebase Realtime Database |
| Storage | Firebase Cloud Storage |
| Auth | Firebase Authentication (+ custom validation) |
| Local Storage | AsyncStorage |
| State Management | React Context API + useState |
| Icons | Expo Vector Icons (Ionicons) |
| Graphics | React Native SVG |
| Gradients | expo-linear-gradient |
| Date/Time | Moment.js |
| Media | Expo Image Picker, Expo File System, Expo Media Library |
| Network | Expo Network |
| Build | Expo Application Services (EAS) |

---

## Project Structure

```
Gojo_Parent_app/
├── gojo-parent-app/
│   ├── app/                        # Screens and routing (Expo Router)
│   │   ├── _layout.tsx             # Root layout — auth, network, Firebase listeners
│   │   ├── index.jsx               # Login screen
│   │   ├── chat.jsx                # Chat thread view
│   │   ├── messages.jsx            # Messages inbox
│   │   ├── userProfile.jsx         # Other user profile view
│   │   ├── profile.jsx             # Parent's own profile
│   │   ├── editMyInfo.jsx          # Edit profile info
│   │   ├── modal.tsx               # Modal screen
│   │   ├── dashboard/
│   │   │   ├── _layout.jsx         # Bottom tab navigation (5 tabs)
│   │   │   ├── home.jsx            # Announcements/posts feed
│   │   │   ├── attendance.jsx      # Attendance tracking
│   │   │   ├── classMark.jsx       # Grades and marks
│   │   │   ├── school.jsx          # Payments, history, calendar
│   │   │   └── profile.jsx         # Redirects to /profile
│   │   ├── post/
│   │   │   └── [id].jsx            # Dynamic post detail screen
│   │   ├── school/
│   │   │   ├── payments.jsx        # Payments tab
│   │   │   ├── history.jsx         # Payment history tab
│   │   │   └── calendar.jsx        # School calendar tab
│   │   └── lib/                    # Utility and data access modules
│   │       ├── accountAccess.js    # Auth, session management, school lookup
│   │       ├── userHelpers.js      # User queries and identity resolution
│   │       ├── parentChildren.js   # Fetch children linked to parent
│   │       ├── chatStore.js        # Chat selection state persistence
│   │       ├── postActionQueue.js  # Offline action queue (likes/reports)
│   │       ├── dataCache.js        # Two-level cache (memory + AsyncStorage)
│   │       ├── imageUrl.js         # Image URL resolution utilities
│   │       └── networkGuard.jsx    # Network connectivity detection
│   ├── components/
│   │   └── ui/
│   │       ├── AppImage.jsx            # Cached image component
│   │       ├── AppLaunchSplash.jsx     # Splash/launch screen
│   │       ├── AppSkeletons.jsx        # Skeleton loading placeholders
│   │       ├── BlockedAccountModal.jsx # Blocked account notice
│   │       ├── DefaultPostImage.jsx    # Fallback image for posts
│   │       ├── FloatingComposer.tsx    # Floating action button
│   │       ├── themed-text.tsx         # Theme-aware text component
│   │       ├── themed-view.tsx         # Theme-aware view component
│   │       ├── parallax-scroll-view.tsx
│   │       ├── haptic-tab.tsx          # Tab bar with haptic feedback
│   │       ├── collapsible.tsx         # Collapsible section component
│   │       └── external-link.tsx       # External URL handler
│   ├── hooks/
│   │   ├── use-parent-theme.tsx    # Global theme & language context
│   │   ├── use-color-scheme.ts     # Device color scheme detection
│   │   ├── use-color-scheme.web.ts # Web color scheme detection
│   │   └── use-theme-color.ts      # Per-theme color resolver
│   ├── constants/
│   │   ├── firebaseConfig.js       # Firebase SDK initialization
│   │   └── theme.ts                # Theme palette constants
│   └── assets/
│       └── images/                 # App graphics and icons
├── app.json                        # Expo app manifest
├── eas.json                        # EAS build configuration
└── gojo-education-default-rtdb-export.json  # Firebase schema reference
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app (for physical device testing) or an iOS/Android simulator

### Installation

```bash
# Clone the repository
git clone https://github.com/BemniT/Gojo_Parent_app.git
cd Gojo_Parent_app/gojo-parent-app

# Install dependencies
npm install

# Start the development server
npx expo start
```

### Running on Device

- **Expo Go**: Scan the QR code shown by `npx expo start`
- **iOS Simulator**: Press `i` in the terminal after starting
- **Android Emulator**: Press `a` in the terminal after starting

### Environment / Firebase Configuration

Firebase credentials are stored in `constants/firebaseConfig.js`. The app connects to:
- **Firebase Realtime Database**: `https://bale-house-rental-default-rtdb.firebaseio.com`
- **Firebase Cloud Storage**: Initialized for media uploads
- **Firebase Auth**: Initialized alongside custom credential validation

To connect the app to a different Firebase project, update the config values in `constants/firebaseConfig.js` with your project's credentials from the Firebase console.

---

## Navigation

The app uses **Expo Router** (file-based routing), meaning screen paths correspond directly to file paths in `app/`.

```
/                       → Login screen
/dashboard/home         → Announcements feed        (Tab 1)
/dashboard/attendance   → Attendance tracking        (Tab 2)
/dashboard/classMark    → Grades and marks           (Tab 3)
/dashboard/school       → School info               (Tab 4)
  └── /school/payments
  └── /school/history
  └── /school/calendar
/dashboard/profile      → Redirects to /profile     (Tab 5)
/profile                → Parent profile
/editMyInfo             → Edit profile screen
/messages               → Messaging inbox
/chat                   → Chat thread
/userProfile            → View another user's profile
/post/[id]              → Post detail view
```

---

## Architecture

### Data Flow

```
Firebase Realtime DB
        │
        ▼
  lib/dataCache.js         ← Two-level cache (memory + AsyncStorage)
        │
        ▼
  Screen Components        ← useState + useEffect for local state
        │
        ▼
  UI Components            ← Presentational, themed via context
```

### Key Design Patterns

- **File-based routing** via Expo Router keeps screen discovery predictable.
- **Library modules in `app/lib/`** centralize all Firebase data access, keeping screens focused on rendering.
- **Two-level caching** (`dataCache.js`) stores data in memory for the current session and in AsyncStorage for persistence across launches, with configurable TTLs.
- **Offline action queuing** (`postActionQueue.js`) stores likes and reports locally when offline and replays them when connectivity is restored.
- **Network guard** (`networkGuard.jsx`) wraps data-fetching operations so screens degrade gracefully when there is no internet connection.

---

## Firebase Database Structure

All school data is scoped under a school key:

```
Platform1/
├── schoolCodeIndex/
│   └── {prefix} → schoolKey            # Resolves username prefix → school
└── Schools/
    └── {schoolKey}/
        ├── schoolInfo/                 # School name, phone, contact
        ├── Users/
        │   └── {userId}/               # Parent and staff accounts
        ├── Students/
        │   └── {studentId}/            # Student records
        ├── Posts/
        │   └── {postId}/               # Announcements with likes/reports
        ├── Messages/
        │   └── {chatId}/               # Chat messages per thread
        ├── Chats/
        │   └── {chatId}/               # Chat thread metadata
        ├── Payments/
        │   └── {paymentId}/            # Payment records per student
        ├── Attendance/
        │   └── {recordId}/             # Attendance per student per day
        └── Marks/
            └── {markId}/               # Grade records per student
```

---

## Authentication Flow

1. Parent enters username (e.g., `abc_john`)
2. First 3 characters (`abc`) used to look up the school key in `schoolCodeIndex`
3. User record fetched from `Schools/{schoolKey}/Users`
4. Password compared against stored value
5. Role checked — must be `"parent"`
6. Account `isActive` status verified
7. Parent-child linkage confirmed in Students records
8. Session data written to AsyncStorage:
   - `userId`, `userNodeKey`, `username`, `role`
   - `parentId`, `schoolKey`, `lastLogin`
9. Root layout attaches a real-time Firebase listener to monitor `isActive` — if the account is deactivated remotely, the user is logged out immediately

---

## State Management

| Scope | Mechanism | Used For |
|---|---|---|
| Global | React Context (`use-parent-theme.tsx`) | Theme (light/dark), language selection |
| Screen | `useState` / `useEffect` | Local UI state, data fetching |
| Persistent local | AsyncStorage | Session, preferences, cached data |
| In-session cache | In-memory `Map` | Fast repeated lookups within a session |
| Real-time | Firebase `onValue` listeners | Chat, post updates, account status |
| Offline queue | AsyncStorage | Queued likes/reports pending sync |

---

## Theming & Localization

Managed by `hooks/use-parent-theme.tsx`, which provides a React Context available throughout the app.

### Theme Modes
- **Light** and **Dark** modes, persisted in AsyncStorage
- Color palettes are computed dynamically based on the active mode
- All UI components consume colors from the theme context

### Supported Languages
| Code | Language |
|---|---|
| `en` | English |
| `am` | Amharic |
| `or` | Oromo |
| `ti` | Tigrinya |

Language preference is stored in AsyncStorage and applied at startup.

---

## Offline Support

The app is designed to remain functional with degraded connectivity:

- **Post actions (likes, reports)** are queued in `postActionQueue.js` when offline and synced to Firebase the next time the network is available.
- **Cached data** from prior sessions is displayed immediately via `dataCache.js` while fresh data loads in the background.
- **Network guard** (`networkGuard.jsx`) prevents crash-prone Firebase calls when there is no connection, showing appropriate UI feedback instead.

---

## Build & Deployment

The project uses **Expo Application Services (EAS)** for builds and distribution.

### Build Profiles (`eas.json`)

| Profile | Distribution | Description |
|---|---|---|
| `development` | Internal | Debug build with dev client |
| `preview` | Internal | Production-like build for testing |
| `production` | Store | Release build for app stores |

### Build Commands

```bash
# Development build
eas build --profile development --platform android

# Preview build
eas build --profile preview --platform all

# Production build
eas build --profile production --platform all
```

### App Identifiers

| Field | Value |
|---|---|
| Android Package | `com.eramota.gojo_parent_app` |
| EAS Project ID | `652990af-62ad-49db-a3c0-1812582ee7e7` |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a pull request against `main`

---

## License

This project is proprietary software. All rights reserved.
