# 🧩 CodeCoach Agent — Chrome Extension (Manifest V3)

> A modern, high-performance Chrome Extension built with **React 18**, **Vite**, and **Shadow DOM Isolation**, designed to augment LeetCode with real-time AI code coaching, test-driven badge progression, fairplay locks, and 3-question mock interviews.

---

## 🏛️ Architecture & Tech Stack

```
   ┌────────────────────────────────────────────────────────┐
   │             LeetCode Page (leetcode.com)               │
   │  ┌──────────────────────────────────────────────────┐  │
   │  │ Shadow DOM Root (#dsa-tutor-panel-root)          │  │
   │  │   - React 18 UI Overlay (App.jsx)                │  │
   │  │   - CSS Isolated Styles (index.css)              │  │
   │  └────────────────────────┬─────────────────────────┘  │
   └───────────────────────────┼────────────────────────────┘
                               │ window.postMessage
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │             Page Context (injected.js)                 │
   │   - Monaco Editor Model Memory Reader                  │
   │   - Fairplay CSS Injection & Tab Concealment           │
   │   - Editor Starter Code Resetting                      │
   └───────────────────────────┬────────────────────────────┘
                               │ chrome.runtime.sendMessage
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │       Background Service Worker (background.js)        │
   │   - MV3 Event Routing & Background Alarms              │
   │   - History Sync with Rate-Limit Throttling            │
   │   - HTTP API Bridge (http://localhost:8000)            │
   └────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

1. **Shadow DOM Isolation**: The entire tutor interface is rendered inside an isolated Shadow DOM container to eliminate CSS style collisions between LeetCode and the extension.
2. **Real-Time Submission Interceptor**: Employs a `MutationObserver` to capture verdicts (`Wrong Answer`, `Accepted`, `Time Limit Exceeded`) on live submissions and immediately runs diagnostics.
3. **Fairplay Lock Engine**:
   - Conceals editorials, solutions, and discussion tabs during active assessments.
   - **Past Submissions Privacy**: Hides historical submission code and past solution drawers while preserving live submission feedback.
   - **Monaco Reset**: Resets the code editor to default starter code when switching problems during tests.
4. **Celebratory Badge Award Modal**: Renders an animated modal with falling confetti, glowing radiant tier badges, and Elo score updates when both Badge Test problems are solved.
5. **Interactive Navigation**: Question 1 and Question 2 navigation cards with direct action buttons (`📍 Active` / `Solve ➔`) and live status indicators.

---

## 🛠️ Build & Installation

### Build Extension
```bash
npm install
npm run build
```
This bundles the extension into `dist/`.

### Load into Chrome / Edge
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose `extension/dist`.
4. Open any problem on [LeetCode](https://leetcode.com/problems/two-sum/) to use the extension.

---

## 🧪 Testing

```bash
npm test
```
Runs the Vitest suite covering UI components, accessibility, lifecycle hooks, and interaction safety.
