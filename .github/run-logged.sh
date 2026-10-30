#!/usr/bin/env bash
# Runs a command; if it fails, the last lines of its output become an error annotation
# (readable from the check-run API without downloading logs).
log=$(mktemp)
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg=$(grep -v '^\s*$' "$log" | tail -n 60 | sed 's/%/%25/g' | sed ':a;N;$!ba;s/\n/%0A/g')
  echo "::error title=$1 failed::$msg"
fi
exit "$code"
