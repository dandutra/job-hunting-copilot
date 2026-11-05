---
type: decision
title: Form filling adopts Simplify
description: No autofill of our own; the app hands over files, form answers come from `/tailor` sessions, and the Simplify extension fills the form.
tags: [applying, scope]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
---

Most target employers (banks, pension funds, insurers) apply through Workday or Taleo. Those forms are multi-page, need an account per company and change often, which makes autofill the costliest piece to build. Simplify's free extension already fills Workday, Greenhouse, Lever and others.

The app stops at approved Tailored resumes and Tailored cover letters. Answers to form questions come from the user's `/tailor` sessions, which already hold the Posting and the Master profile, and the user answers salary questions alone. The user applies with Simplify, reviews every field and submits. Building our own extension is out of scope until after an offer, as a possible portfolio piece.
