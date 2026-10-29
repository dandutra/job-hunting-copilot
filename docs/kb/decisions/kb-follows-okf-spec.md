---
type: decision
title: KB follows the OKF spec
description: This bundle follows OKF v0.2 where it differs from agent-workflow's KB-FORMAT.md.
tags: [kb, okf, agent-workflow]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
sources:
  - resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
    title: OKF v0.2 specification
---

agent-workflow's `skills/domain-modeling/KB-FORMAT.md` differs from the OKF v0.2 spec in five places. In KB-FORMAT, `index.md` carries `type` and `title` frontmatter, the glossary has none, `status` uses `active | superseded`, `verified` and `stale_after` are bare dates, and `sources` are bare strings. The spec allows only `okf_version` on the root index and requires a `type` on every other file. It uses `draft | stable | deprecated`, `{by, at}` actor records with a `human:` prefix, ISO datetimes with a UTC offset, and `sources` entries with a `resource`.

This bundle follows the spec. KB-FORMAT.md and `hooks/kb-capture.sh`, which parses the Types table from `index.md`, get fixed in a separate agent-workflow PR. Concepts Claude or Jev drafts carry `generated.by`. A concept counts as human-reviewed only after the user adds `verified: {by: human:dandutra, at: ...}`.
