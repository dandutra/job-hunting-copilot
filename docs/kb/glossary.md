---
type: glossary
title: Glossary
description: The project's vocabulary, one word per concept.
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
---

# Glossary

**Posting**:
One job opening at one company, however many places it appears.
_Avoid_: Job, listing, opening

**Sighting**:
One job source reporting a Posting, with that source's URL and date. A Posting has one or more Sightings.
_Avoid_: Duplicate, copy

**Job source**:
One access method Postings come from, such as Greenhouse, Workday, JobSpy-LinkedIn, Adzuna or the alert inbox. One company's board on an ATS is a Watched company, not a Job source.
_Avoid_: Portal, feed, board

**Company**:
The employer a Posting is at, with every name Job sources use for it (for example "RBC" and "Royal Bank of Canada").
_Avoid_: Employer, organization

**Watched company**:
A Company whose own ATS board is polled, named by its ATS and board slug.
_Avoid_: Target company, tracked company

**Lookalike**:
A link between two Postings that may be the same opening but lack the evidence to merge. The user merges or dismisses it.
_Avoid_: Possible duplicate, merge candidate

**Posted at**:
The date of a Posting's earliest Sighting. Ranking uses it as the Posting's age.
_Avoid_: Date posted, published date

**Closed Posting**:
A Posting whose Watched company boards have all stopped listing it, with no Sighting from any Job source since. Only a board can close a Posting.
_Avoid_: Expired, filled, inactive

**Stale Posting**:
A Posting with no board Sighting whose newest Sighting was last seen more than 30 days ago. It is a guess that the opening is gone.
_Avoid_: Old, expired, closed

**Tier**:
A Posting's relevance band (A, B or C), from its fit with the Master profile, adjusted by Role family and Work arrangement. Within a Tier, newer Postings rank first.
_Avoid_: Score, rank, match

**Tier cap**:
A rule that holds a Posting at C however strong its fit, such as a role closed to juniors, work outside the GTA, a US-only role, a required security clearance or required French. The Posting stays visible.
_Avoid_: Filter, disqualifier, gate

**Label**:
The user's own Tier for a Posting, set by what they would do with it: A means tailor and apply on sight, B means apply if time allows, C means skip. The user may also answer "can't tell".
_Avoid_: Rating, annotation, ground truth

**Label queue**:
The screen that shows the user one Posting at a time with its Tier hidden, picked by the app from every Tier. Only Labels from it count toward calibration.
_Avoid_: Review queue, inbox

**Feed correction**:
The user's own Tier for a Posting, given from the feed with Jev's Tier in view. It reports a wrong Tier and does not count toward calibration.
_Avoid_: Feed label

**Thin Posting**:
A Posting with no full description yet, only a snippet or nothing. It gets a Tier and a visible flag, and it stays out of the Label queue.
_Avoid_: Stub, partial Posting

**Role family**:
The kind of role a Posting is for: full-stack, back-end, front-end, cloud/ops or support, in that order of preference.
_Avoid_: Category, track

**Work arrangement**:
Where the work happens: hybrid, remote or on-site, in that order of preference.
_Avoid_: Regime, work mode

**Master profile**:
The structured record of all of the candidate's experience, skills and education. It is the only input tailoring may draw facts from.
_Avoid_: General resume, base resume, CV

**Entry**:
One item in the Master profile with a permanent ID, which a Tailored resume line can cite.
_Avoid_: Item, record

**Fact**:
One Entry stating a single claim about the candidate's work, with its ownership and source. An edit that changes the claim retires the Fact and creates a new one.
_Avoid_: Bullet, achievement

**Experience**:
One employment or volunteer position the candidate has held, as an Entry in the Master profile. A co-op counts as employment.
_Avoid_: Role, job, work history

**Project**:
Something the candidate built on their own, outside any Experience. Work done during an Experience is recorded as Facts under that Experience.
_Avoid_: Personal project, portfolio item

**Do-not-claim**:
A statement the candidate must never make in a Tailored resume or Tailored cover letter, even if a Fact seems to support it. It is kept in the Master profile and is never cited as a source.
_Avoid_: Forbidden claim, exclusion

**Tailored resume**:
A resume built for one Posting by selecting and rewording Entries from the Master profile. Every line cites one or more Entries. It is a draft until the user approves it, and a Posting has at most one approved Tailored resume.
_Avoid_: Custom resume, adjusted resume

**Tailored cover letter**:
A cover letter written for one Posting from the Master profile, with every paragraph citing one or more Entries. It is approved together with its Tailored resume.
_Avoid_: Custom cover letter

**Trace check**:
The app's rule check that every line of a Tailored resume or Tailored cover letter cites Entries it is allowed to use. It runs when a draft is submitted and again when it is approved. It cannot catch overstatement.
_Avoid_: Validation, citation check

**Claim review**:
A reading of each line of a draft against its cited Facts and the Do-not-claims, looking for overstatement. The `/tailor-review` skill does it first, without the Posting in view, and the user does it before approving.
_Avoid_: Fact check, audit

**Application**:
The candidate's submission for one Posting, with its status over time.
_Avoid_: App (that word means the software)
