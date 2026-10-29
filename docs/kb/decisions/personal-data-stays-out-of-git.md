---
type: decision
title: Personal data stays out of git
description: The repo is public from the first commit, so the Master profile, Tailored resumes, alert emails and Jev labels live only in the database and a gitignored data/ folder.
tags: [privacy, portfolio]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
---

The repo is a portfolio piece and is public from the first commit, so its whole history is visible. A private-until-January repo was rejected because scrubbing history before publishing is error-prone and hides the commit trail.

Anything personal stays out of git: the Master profile, Tailored resumes and cover letters, contact details, alert emails and the user's calibration labels. It lives in Postgres and in a gitignored `data/` folder. A fake sample Master profile is committed so the README demo works for anyone. A slip here can't be undone, because a pushed commit stays in forks and caches.
