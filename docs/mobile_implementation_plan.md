# Mobile Application Implementation Plan (Flutter)

## 🎯 Goal Description
The objective is to build a premium, cross-platform mobile application (iOS & Android) using **Flutter**. The app will serve as the mobile counterpart to the existing React Web App, integrating deeply with the fully deployed backend Kubernetes microservices (User, Feed, Job, Event, Notification, Research, Analytics). 

The UI/UX must be state-of-the-art, drawing inspiration from **LinkedIn** (professional networking, jobs, events) and **Instagram** (visually appealing feed, smooth infinite scrolling, micro-animations, rich imagery).

---

## ⚠️ User Review Required
- **Prebuilt Code**: There is an existing Flutter project scaffolded at `mobile/delta`. We will use this as the foundation. Please confirm if we should replace it entirely or build upon it.
- **Keycloak Auth**: Mobile OAuth2 flows require opening a system browser or webview (via `flutter_appauth`). Please confirm if the `miniproject.local` redirect URIs in Keycloak are configured to support mobile app deep links (e.g., `app://oauth2redirect`).

---

## 🚀 Proposed Phases & Deliverables

### Phase 1 — Foundation & Authentication
**Objective:** Set up the Flutter project architecture, network layer, and Keycloak authentication.
- **1.1 Setup**: Initialize `mobile/delta` with state management (e.g., Riverpod or Provider), routing (go_router), and HTTP client (Dio with interceptors).
- **1.2 Theming**: Define a premium Design System (Dynamic color palette, Google Fonts like *Inter* or *Outfit*, smooth card shadows, glassmorphism overlays).
- **1.3 Auth Flow**: Integrate `flutter_appauth` for Keycloak Authorization Code flow + PKCE. Store the JWT securely using `flutter_secure_storage`.
- **1.4 API Interceptor**: Attach the Bearer token to all outgoing Dio requests and handle 401 token refreshes.
- **🧪 Testing**: 
  - *Unit:* Test Dio interceptors for token injection.
  - *Integration:* Verify login deep-link redirects and token persistence across app restarts.

### Phase 2 — Main Layout & User Profile
**Objective:** Build the core navigation shell and user profile management.
- **2.1 Shell Layout**: Instagram-style bottom navigation bar with micro-animations on tap (Feed, Connections/Events, Create (+), Jobs, Profile).
- **2.2 Profile Screen**: Premium profile view. Avatar layout, department/role badges, and a staggered grid/list for user's past activity. 
- **2.3 Edit Profile**: Form with validation to update details (`PATCH /api/v1/users/me`), syncing to MongoDB.
- **🧪 Testing**: 
  - *Widget:* Assert bottom nav state changes.
  - *Integration:* Edit profile, mock 200 OK, verify UI updates immediately.

### Phase 3 — The Feed (Social Engine)
**Objective:** Implement the high-performance visual feed.
- **3.1 Feed List**: Infinite scrolling `ListView.builder` fetching paginated data from `feed-service`.
- **3.2 Post Cards**: Rich UI cards. `CachedNetworkImage` for MinIO-hosted images, smooth shimmer loading effects.
- **3.3 Interactions**: Double-tap to like (Instagram-style heart animation), comment bottom-sheet modal.
- **3.4 Create Post**: A dedicated full-screen modal to write text and pick images from the device gallery (`image_picker`), uploading via MinIO presigned URL.
- **🧪 Testing**: 
  - *Widget:* Verify double-tap triggers the animation controller.
  - *Integration:* Mock paginated API response, verify scroll controller triggers "load more" seamlessly.

### Phase 4 — Academic & Professional Hub (Jobs & Events)
**Objective:** Implement the LinkedIn-style professional networking features.
- **4.1 Jobs Board**: Tinder/LinkedIn style swipeable or clean list view for job postings. Filter chips (Internship, Research, Full-time). 
- **4.2 Job Application**: "One-click Apply" button for students (triggers `POST /api/v1/jobs/:id/apply`).
- **4.3 Events Hub**: Horizontal scrolling carousels for Upcoming Events. Modern calendar UI components.
- **4.4 RSVP Flow**: Instant feedback UI for RSVPs with optimistic state updates.
- **🧪 Testing**: 
  - *Widget:* Verify role-based UI (e.g., Admin sees "Create" buttons, Students see "Apply").
  - *Integration:* E2E test the RSVP flow and ensure the local RSVP count increments without a full page reload.

### Phase 5 — Real-time Notifications & Research
**Objective:** Keep the user engaged and implement document interactions.
- **5.1 Notification Center**: A dedicated screen showing the feed of notifications. Polling or WebSocket to get unread counts for the app badge.
- **5.2 Research Projects**: Clean list of collaborative projects. Tapping a document leverages `url_launcher` to download/view the MinIO file on the mobile device.
- **🧪 Testing**: 
  - *Unit:* Map the Notification JSON schema to Dart models correctly. 
  - *Integration:* Trigger a mock 'post liked' event, verify the red dot indicator appears on the bottom nav bar.

### Phase 6 — Admin Analytics & Infrastructure Status 
**Objective:** Ensure feature parity with the Web Dashboard for administrators.
- **6.1 Analytics Dashboard**: Dedicated admin screen showing key metrics (Active Users, New Posts) using `fl_chart` for data visualization of daily user signups and popular content.
- **6.2 Infrastructure Overview**: Pull-to-refresh list mapping the health endpoints of the microservices to display real-time Kubernetes Pod latencies and system states.
- **🧪 Testing**: 
  - *Unit:* Ensure RBAC (Role-Based Access Control) prevents non-admins from routing to Phase 6 screens.
  - *Integration:* Verify API polling handles 503 Service Unavailable gracefully if the analytics-service goes down.

---

## 🔬 Testing Plan Summary

1. **Automated Unit & Widget Tests:**
   * Run using `flutter test`.
   * We will create mock objects using `mockito` to isolate the UI components from the actual network layer.
   * Every major screen will have a Widget test to verify rendering and button callbacks.

2. **Integration Tests (E2E):**
   * Run using `flutter test integration_test/app_test.dart`.
   * These tests will spin up the Flutter app in a simulated environment, script interactions (tap login, enter text, scroll feed), and assert the final UI state.
   * We will test against the live Minikube Kubernetes cluster running locally mapping to `http://miniproject.local/api/v1/`.

3. **Manual UX Verification:**
   * Run using `flutter run -d <emulator/device>`.
   * We will visually verify micro-animations, scroll performance (targeting 60fps), and dark mode color contrast.

---
*Ready for user review.*
