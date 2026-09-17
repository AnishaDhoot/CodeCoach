# CodeCoach Agent — Privacy Policy

_Last updated: 2026-09-17_

CodeCoach Agent ("the extension") is a study companion that overlays LeetCode to
give you conceptual failure diagnostics, progressive hints, spaced-repetition
reviews, and progress tracking. This policy explains exactly what data the
extension handles, why, and who it is shared with. Plain language, no surprises.

> **Replace `<CONTACT_EMAIL>` and `<BACKEND_URL>` below before publishing.**

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
(`<BACKEND_URL>`) in a database, associated with a **random device token** the
extension generates on first run and keeps in `chrome.storage.local`.

- The device token is **anonymous**. It is not your name, email, or LeetCode login.
- We do **not** collect your name, email address, password, LeetCode credentials,
  payment information, browsing history, or any data from sites other than LeetCode.
- Your LeetCode session cookies are **never** read, stored, or transmitted by us;
  the sync runs inside LeetCode's own page context and only reads the public
  problem-status API you are already authenticated to.

## Third parties

- **AI provider (Groq).** When you request an AI feature, the relevant code and
  problem context are sent to Groq's API to generate the response, then returned to
  you. This happens only on your explicit action. Review Groq's own privacy terms
  for how they handle API inputs. We do not send your data to any other AI provider.
- We do **not** sell your data, use it for advertising, or share it with data brokers.
- We do **not** use analytics or tracking SDKs.

## Data retention and control

- Practice data persists so your progress is there next time. You can clear
  spaced-repetition data in the app, and you can erase your local identity at any
  time by clearing the extension's site data (which removes the device token; a new
  anonymous token is created on next use).
- To request deletion of the data associated with your device token, contact
  `<CONTACT_EMAIL>`.

## Permission justifications (for Chrome Web Store review)

| Permission | Why it is needed |
|---|---|
| `storage` | Store the anonymous device token and your settings locally. |
| `scripting` | Inject the sync routine into your open LeetCode tab so it can read your solved-problem history in LeetCode's own (same-origin) context. |
| `tabs` | Find your open LeetCode tab to run the sync, and open a recommended problem when you click it. |
| `alarms` | Periodically refresh the "reviews due" badge count on the toolbar icon. |
| `host_permissions: leetcode.com` | The overlay, page scraping, and history sync run only on LeetCode. |
| `host_permissions: <BACKEND_URL>` | Talk to the extension's backend to save and load your progress. |

## Children's privacy

The extension is intended for a general audience of programmers and is not directed
to children under 13. We do not knowingly collect personal information from children.

## Changes to this policy

We may update this policy; material changes will be reflected by the "Last updated"
date above and in the extension's listing.

## Contact

Questions or data-deletion requests: `<CONTACT_EMAIL>`.
