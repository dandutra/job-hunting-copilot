---
type: decision
title: Scraped boards are a job source
description: JobSpy covers LinkedIn and Indeed with the ToS risk accepted, next to ATS boards, alert emails and Adzuna.
tags: [ingestion, job-source, scope]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
sources:
  - resource: https://github.com/speedyapply/JobSpy
    title: JobSpy
---

LinkedIn's and Indeed's terms forbid automated access. Using JobSpy instead of writing a scraper doesn't change that, and the requests come from our own IP. The user accepts that risk because more Job sources means more Postings seen early.

Four kinds of Job source run side by side: public ATS job-board APIs for a curated list of Toronto companies (Greenhouse, Lever, Ashby, SmartRecruiters, and Workday's career-site JSON), the user's own job-alert emails, the Adzuna API, and JobSpy for LinkedIn and Indeed. ATS boards are expected to be the earliest signal. The project builds no scraper of its own.
