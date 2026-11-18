#!/usr/bin/env bash
# Prints the number of pages Microsoft Word gives a .docx. Word is the authority because the user
# exports the PDF from it; LibreOffice and Typst break lines differently.
# Exit 3: the file is open in Word with unsaved edits, so it was left alone.
set -euo pipefail
f=${1:-}
[[ -f $f && $f == *.docx ]] || { echo "usage: page-count.sh <file.docx>" >&2; exit 2; }
abs="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"

# A copy Word already holds may predate the last build, so close it first.
closed=$(osascript - "$abs" <<'OSA'
on run argv
  -- Word names documents by HFS path, and POSIX path of fails inside a Word tell block.
  set target to (POSIX file (item 1 of argv)) as string
  if application "Microsoft Word" is not running then return "ok"
  tell application "Microsoft Word"
    -- An empty document list reads as {missing value}, so walk it by index, last first.
    repeat with i from (count of documents) to 1 by -1
      set d to document i
      if (full name of d) is target then
        if not (saved of d) then return "unsaved"
        close d saving no
      end if
    end repeat
  end tell
  return "ok"
end run
OSA
)
[[ $closed == ok ]] || { echo "$f is open in Word with unsaved edits; save or close it, then retry" >&2; exit 3; }

# `open` gives Word's sandbox access to the file; an AppleScript open raises a Grant Access dialog.
open -g -a "Microsoft Word" "$abs"
osascript - "$abs" <<'OSA'
on run argv
  set target to (POSIX file (item 1 of argv)) as string
  tell application "Microsoft Word"
    repeat 60 times
      repeat with i from 1 to (count of documents)
        set d to document i
        if (full name of d) is target then
          set n to compute statistics d statistic statistic pages
          close d saving no
          return n
        end if
      end repeat
      delay 0.5
    end repeat
  end tell
  error "Word did not open " & target & " within 30 seconds"
end run
OSA
