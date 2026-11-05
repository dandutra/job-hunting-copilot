---
type: decision
title: Only boards close a Posting
description: A Posting is Closed only on a Watched company board's evidence; a Posting with no board seen in 30 days can only go Stale, and both drop out of the feed without touching an Application.
tags: [ingestion, feed]
sources: ["#65", "#66"]
generated:
  by: claude-opus-5-5
  at: 2026-11-05T12:00:00-05:00
---

JobSpy, Adzuna and alert emails only report listings inside a time window, so a listing they stop reporting may still be open, and its last-seen date stays at the day it was found. Only a Watched company's board lists every open job at once, so only its absence is evidence. A single rule based on last-seen dates would have closed every LinkedIn Posting a few days after it was first seen.

A board Sighting closes after its listing has been missing from complete listings of that board for 24 hours. A listing counts as complete only when the adapter fetched every row with no error. An empty list from a board that had open Sightings never counts, because Workday pages wrap and any board can return a bad page. A listing that reappears within 30 days reopens the same Sighting.

A Posting is Closed when all of its live board Sightings (defined below) are closed, there is at least one, and no Sighting from any source was seen after the latest close. A board is the employer's own record, so it outranks aggregator rows from before the close. A fresh report after the close, on another board or an aggregator, means the company is still hiring, and it reopens the Posting.

A Posting with no live board Sighting goes Stale 30 days after its newest Sighting was last seen. A board Sighting is live when it is closed or was seen in the last 30 days. A healthy board refreshes its open Sightings every hour, so an open one quiet for 30 days means the board is no longer read cleanly: the company was un-watched, or every read fails or comes back incomplete. Without this rule such a Posting would stay open forever. Thirty days also matches the key window, after which a returning listing starts a new Sighting and the old one could never reopen. A closed board Sighting always stays live, so a Closed Posting never turns Stale. Stale is kept apart from Closed because it is a guess, not a fact. Without it, aggregator Postings would pile up in the feed from November until the search starts in January.

Closed and Stale Postings drop out of the feed's Tier groups and never alert. A toggle lists them, and `/postings/:id` still opens with a badge. Closing never changes an Application's status, because employers often pull a listing while still reviewing applicants. The Label queue still draws both, because a Label judges fit, not whether the opening is still live.
