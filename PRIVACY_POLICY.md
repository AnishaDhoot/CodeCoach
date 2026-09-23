# CodeCoach Agent — Privacy Policy

_Last updated: 2026-09-23_ · Contact: codecoach.work@gmail.com

CodeCoach Agent ("the extension") is a study companion that overlays LeetCode to
give you conceptual failure diagnostics, progressive hints, spaced-repetition
reviews, and progress tracking. This policy explains exactly what data the
extension handles, why, and who it is shared with. Plain language, no surprises.

## What the extension accesses

While you are on `leetcode.com`, and only when you use a feature that needs it:

- **Your LeetCode solved-problem history** — read from your own logged-in LeetCode
  session when you press "Sync", to seed your topic progress. Only problem slugs,
  titles, difficulty, topic tags, and solve timestamps are read.
- **The code in the LeetCode editor** — read at the moment you request an AI action
  (diagnose a failure, hint, edge cases, approach critique, explain-back). Your code
  is sent to the AI provider to generate that feedback (see "Third parties").
- **The current problem's title and constraints** — scraped from the page to give
  the AI context.
- **Your own notes and self-ratings** — text you type into the extension.

## What we store, and where

Your practice data — solved problems, attempts, mistake categories, topic mastery,
streaks, spaced-repetition schedules, notes — is stored on the extension's backend
(`https://codecoach-backend-hja6.onrender.com`) in a database, associated with a **random device token** the
extension generates on first run and keeps in `chrome.storage.local`.

- The device token is **anonymous**. It is not your name, email, or LeetCode login.
- We do **not** collect your name, email address, password, LeetCode credentials,
  payment information, browsing history, or any data from sites other than LeetCode.
- Your LeetCode session cookies are **never** stored or sent to our backend. The
  sync runs inside LeetCode's own page context, so LeetCode's own requests carry
  your existing session; the extension only reads your problem-status data from it.

## Third parties

- **AI provider (Groq).** When you request an AI feature, the relevant code and
  problem context are sent to Groq's API to generate the response, then returned to
  you. This happens only on your explicit action. Review Groq's own privacy terms
  for how they handle API inputs. We do not send your data to any other AI provider.
- We do **not** sell your data, use it for advertising, or share it with data brokers.
- We do **not** use analytics or tracking SDKs.

## Data retention and control

- Practice data persists so your progress is there next time. You can erase your
  local identity at any time by removing the extension or clearing its data (which
  removes the device token; a new anonymous token is created on next use).
- To request deletion of the data associated with your device token, contact
  `codecoach.work@gmail.com`.

## Permission justifications (for Chrome Web Store review)

| Permission | Why it is needed |
|---|---|
| `storage` | Store the anonymous device token and your settings locally. |
| `scripting` | Inject the sync routine into your open LeetCode tab so it can read your solved-problem history in LeetCode's own (same-origin) context. |
| `alarms` | Periodically refresh the "reviews due" badge count on the toolbar icon. |
| `host_permissions: leetcode.com` | The overlay, page scraping, and history sync run only on LeetCode. |
| `host_permissions: https://codecoach-backend-hja6.onrender.com` | Talk to the extension's backend to save and load your progress. |

## Children's privacy

The extension is intended for a general audience of programmers and is not directed
to children under 13. We do not knowingly collect personal information from children.

## Changes to this policy

We may update this policy; material changes will be reflected by the "Last updated"
date above and in the extension's listing.

## Contact

Questions or data-deletion requests: codecoach.work@gmail.com