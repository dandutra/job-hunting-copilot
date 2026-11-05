---
type: decision
title: Only boards close a Posting
description: A Posting is Closed only on a Watched company board's evidence; any other Posting goes Stale after 30 days with no report and no board listing it, and both drop out of the feed without touching an Application.
tags: [ingestion, feed]
sources: ["#65", "#66"]
generated:
  by: claude-opus-5-5
  at: 2026-11-05T12:00:00-05:00
---

JobSpy, Adzuna and alert emails only report listings inside a time window, so a listing they stop reporting may still be open, and its last-seen date stays at the day it was found. Only a Watched company's board lists every open job at once, so only its absence is evidence. A single rule based on last-seen dates would have closed every LinkedIn Posting a few days after it was first seen.

A board Sighting closes after its listing has been missing from complete listings of that board for 24 hours. A listing counts as complete only when the adapter fetched every row with no error. An empty list from a board that had open Sightings never counts, because Workday pages wrap and any board can return a bad page. A listing that reappears within 30 days reopens the same Sighting.

A Posting is Closed when it has at least one closed board Sighting, no open board Sighting seen in the last 30 days, and no Sighting from any source seen after the latest close. A board is the employer's own record, so it outranks aggregator rows from before the close. A fresh report after the close, on another board or an aggregator, means the company is still hiring, and it reopens the Posting.

A Posting that is not Closed goes Stale 30 days after its newest Sighting was last seen, unless a board seen in the last 30 days still lists it. Stale is kept apart from Closed because it is a guess, not a fact. Without Stale, aggregator Postings would pile up in the feed from November until the search starts in January.

A healthy board refreshes its open Sightings every hour. An open board Sighting quiet for 30 days therefore means the board is no longer read cleanly, because the company was un-watched or every read fails or comes back incomplete. Such a Sighting keeps nothing open. The same rule catches a report after a close that then goes quiet. Without it, both would leave the Posting open forever. Thirty days also matches the key window. After it, a returning listing starts a new Sighting, and the old one can never reopen. A Closed Posting never turns Stale as time passes. Only a new report changes it, and a new report reopens it.

Closed and Stale Postings drop out of the feed's Tier groups and never alert. A toggle lists them, and `/postings/:id` still opens with a badge. Closing never changes an Application's status, because employers often pull a listing while still reviewing applicants. The Label queue still draws both, because a Label judges fit, not whether the opening is still live.
