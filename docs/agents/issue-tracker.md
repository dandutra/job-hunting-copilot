# Issue tracker

Work lives in GitHub Issues on this repo. Knowledge lives in `docs/kb/`. Commands use `gh`, whose `{owner}` and `{repo}` placeholders resolve to the current repo.

## Labels

| Label | Meaning |
|---|---|
| `wayfinder:map` | A wayfinder map |
| `wayfinder:research` | AFK ticket, resolved by a subagent running the research skill |
| `wayfinder:prototype` | HITL ticket, resolved with the prototype skill |
| `wayfinder:grilling` | HITL ticket, resolved with the grilling and domain-modeling skills |
| `wayfinder:task` | Manual work that unblocks a decision |

## Wayfinding operations

Child tickets are native sub-issues of the map. Blocking is GitHub's native issue dependencies. Both APIs take the issue's numeric `id`, not its `number`:

```sh
id() { gh api "repos/{owner}/{repo}/issues/$1" --jq .id; }
```

**Create the map**

```sh
gh issue create --title "<map title>" --label wayfinder:map --body-file map.md
```

**Create a ticket** under map `MAP`, then attach it:

```sh
n=$(gh issue create --title "<question>" --label wayfinder:research --body-file ticket.md | sed 's#.*/##')
gh api "repos/{owner}/{repo}/issues/MAP/sub_issues" -F sub_issue_id="$(id "$n")"
```

**Wire blocking** (second pass, once every ticket has a number). Ticket `B` is blocked by ticket `A`:

```sh
gh api "repos/{owner}/{repo}/issues/B/dependencies/blocked_by" -F issue_id="$(id A)"
```

**Claim** before any work:

```sh
gh issue edit N --add-assignee @me
```

**Frontier**: open, unassigned sub-issues of the map whose blockers are all closed, in the map's sub-issue order:

```sh
gh api "repos/{owner}/{repo}/issues/MAP/sub_issues?per_page=100" \
  --jq '.[] | select(.state == "open" and (.assignees | length) == 0) | "\(.number)\t\(.title)"' |
while IFS=$'\t' read -r n title; do
  open=$(gh api "repos/{owner}/{repo}/issues/$n/dependencies/blocked_by" --jq '[.[] | select(.state == "open")] | length')
  [ "$open" -eq 0 ] && printf '%s\t%s\n' "$n" "$title"
done
```

**Resolve**: post the answer, close the ticket, then add its line to the map's Decisions so far:

```sh
gh issue comment N --body-file resolution.md
gh issue close N --reason completed
gh issue view MAP --json body --jq .body > map.md   # edit, then:
gh issue edit MAP --body-file map.md
```

**Rule out of scope**: close as not planned and add one line to the map's Out of scope:

```sh
gh issue close N --reason "not planned"
```
