---
type: decision
title: Master profile is a versioned YAML file
description: The Master profile is one gitignored YAML file in our own schema with permanent Entry IDs; Postgres stores an immutable version of each import.
tags: [tailoring, privacy]
sources: ["#13"]
generated:
  by: claude-opus-5-5
  at: 2026-11-02T10:55:38-05:00
---

Every line of a Tailored resume must cite the Entries it came from, so Entries need IDs that outlive edits. JSON Resume was rejected because its highlights are plain strings: adding IDs, tags, ownership and sources turns them into objects, and the file is then no longer valid JSON Resume. Postgres as the only copy was rejected because it needs an editor screen before the Dec 20 milestone.

The real copy is `data/master-profile.yaml`, edited by hand or with an agent. An import validates it and stores an immutable version in Postgres, identified by its SHA-256 hash. `data/` is gitignored, so those versions are the file's only history. A Tailored resume records the version it was built from.

IDs are a kind letter plus a number, opaque and never reused. An edit that keeps the claim keeps the ID. An edit that changes the claim retires the Entry and creates a new one. Entries are never deleted, and the import rejects a file where a known ID has disappeared. Where this repo's Master profile and the portfolio site disagree, the Master profile wins. The full rules are in [Master profile schema](https://github.com/dandutra/job-hunting-copilot/issues/13).
