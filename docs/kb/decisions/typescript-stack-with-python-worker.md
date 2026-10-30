---
type: decision
title: TypeScript stack with a Python worker
description: React (Vite), NestJS and Postgres, plus a Python worker because JobSpy is a Python library.
tags: [stack, portfolio]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
---

The portfolio lacks a traditional full-stack project. Toronto's target employers mostly hire for Java/Spring or .NET back ends, and Spring Boot was the stronger hiring signal. NestJS won because its modules, dependency injection and controllers are close to Spring's structure, it builds on the user's Node experience, and learning Spring inside the build window would put the Jan 1, 2027 start at risk. Next.js was rejected because it blurs the front-end/back-end split the portfolio is meant to show.

JobSpy runs only in Python, so a small Python service runs JobSpy next to the TypeScript services. The rest of ingestion is TypeScript: [Ingestion lives in NestJS](ingestion-lives-in-nestjs.md).
