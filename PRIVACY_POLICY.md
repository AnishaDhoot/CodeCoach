# CodeCoach Privacy Policy

Last updated: September 24, 2026
Contact: codecoach.work@gmail.com

Hi! CodeCoach is a small project that helps you practice on LeetCode. It explains why your solutions fail, gives you hints, and keeps track of your progress. To do that it needs to handle some of your data, and I want you to know exactly what that is. No legal fog, just the facts.

## The short version

- You don't need an account. CodeCoach never asks for your name, email or password.
- It only works on leetcode.com. It doesn't look at any other website you visit.
- Your code is sent for analysis only when a submission fails or when you ask for help (a hint, an edge case check and so on).
- Your data is never sold, never used for ads and never shared with data brokers.
- You can ask me to delete your data at any time.

## What CodeCoach reads

While you're on leetcode.com, CodeCoach can read:

**Your code in the editor.** It's read when a submission fails (so CodeCoach can explain what went wrong) and when you use one of the help features, like a hint, the approach check, the edge case check, a question to the tutor or the explanation check after a solve. It is not read in the background while you type, except as described in the Badge Test note below.

**The problem you're on.** The problem's name, the URL and the constraints listed on the page, so the feedback fits the problem.

**Your submission results.** Whether a submission was accepted or failed, plus the failing test case LeetCode shows you. This is how your progress and streaks get updated.

**Your solved problem history, if you choose to sync it.** When you press "Sync All LeetCode History", CodeCoach asks LeetCode for the list of problems you've solved: their names, difficulty, topic tags and when you solved them. It uses the LeetCode login you already have open in your browser. It never sees or stores your LeetCode password or cookies.

**Anything you type into CodeCoach.** Your notes, difficulty ratings, questions to the tutor and focus topics.

## What gets stored, and where

**On the CodeCoach server.** Your practice data is saved on the CodeCoach server so your progress is there next time: problems you've attempted and solved, mistake types, topic levels and badges, review dates, streaks, notes and your daily AI usage count. The server runs on Render and the database is hosted by a cloud database provider.

All of this is tied to a random ID that the extension creates the first time you use it. That ID isn't linked to your name, your email or your LeetCode account. It's just a random string.

**In your browser.** A few small things are kept locally and never sent anywhere:

- the random ID mentioned above
- whether you left the CodeCoach panel open or closed
- when you dismissed today's review reminder
- during a Badge Test, the code you type on the two test problems, so it's still there if you switch between them. This is deleted as soon as the test ends.

## Who else sees your data

**Groq (the AI provider).** When CodeCoach needs to explain a failure or answer a question, it sends your code and the problem details to Groq, which generates the response. Nothing else is sent to Groq. You can read how Groq handles data in its own privacy policy.

**Hosting providers.** The server and database are run by hosting companies (Render and the database provider). They store the data for us but don't use it for anything else.

That's everyone. CodeCoach doesn't use analytics, tracking pixels or advertising tools of any kind.

## Keeping or deleting your data

Your practice data stays on the server so your progress isn't lost.

If you remove the extension or clear its data, your random ID goes away and CodeCoach starts fresh with a new one. Your old data can no longer be connected to you, but it still exists on the server until it's deleted.

If you want your data deleted from the server, email codecoach.work@gmail.com and I'll take care of it. It helps to include your device ID. You can find it by opening chrome://extensions, turning on Developer mode, clicking "service worker" under CodeCoach, and running this in the console that opens:

    chrome.storage.local.get("authToken", console.log)

## Why the extension needs its permissions

Chrome shows you what an extension is allowed to do. Here's why CodeCoach asks for each permission:

| Permission | What it's used for |
|---|---|
| storage | Saving the random ID and your settings in your browser. |
| scripting | Running the history sync inside your LeetCode tab, so it can read your solved problems using your existing LeetCode login. |
| alarms | Checking every 15 minutes whether you have reviews due, to show the count on the toolbar icon. |
| Access to leetcode.com | Showing the CodeCoach panel and reading the problem and your code on LeetCode. |
| Access to codecoach-backend-hja6.onrender.com | Saving and loading your progress on the CodeCoach server. |

## Children

CodeCoach is made for programmers in general and isn't aimed at children under 13. I don't knowingly collect information from children under 13. If you think a child has used it, email me and I'll delete the data.

## Changes to this policy

If anything here changes, I'll update this page and the date at the top. If the change is significant, I'll also mention it in the Chrome Web Store listing.

## Questions?

Email codecoach.work@gmail.com. A real person reads every message.

CodeCoach is an independent project and is not affiliated with or endorsed by LeetCode.
