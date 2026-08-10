#!/usr/bin/env bash
# Second user acting on the document Riya has open.
#
# Reports what the server ACTUALLY returned rather than narrating an expected outcome — a
# demo script that claims "refused" when the save succeeded is worse than no script at all.
#
# Precondition: Riya must have 3.2.P.5 open in the AmFile window, so she holds the lock.
# The script checks that and tells you if she doesn't.
set -euo pipefail
API=http://127.0.0.1:8787
PW='AmFile2026!'

tok() {
  curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PW\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'
}

ARJUN=$(tok arjun.mehta@amneal.com)
ADMIN=$(tok admin@amneal.com)

DOCJSON=$(curl -s "$API/api/documents" -H "Authorization: Bearer $ADMIN")
DOC=$(echo "$DOCJSON" | python3 -c 'import sys,json;d=json.load(sys.stdin)["documents"];print([x for x in d if "3.2.P.5" in x["path"]][0]["id"])')
LOCKED=$(echo "$DOCJSON" | python3 -c 'import sys,json;d=json.load(sys.stdin)["documents"];x=[y for y in d if "3.2.P.5" in y["path"]][0];print(x["lockedBy"]["displayName"] if x["lockedBy"] else "")')

echo "Document: 3.2.P.5 Control of Drug Product"
if [ -z "$LOCKED" ]; then
  echo
  echo "  ! Nobody currently holds this document."
  echo "    Open it in the AmFile window as Riya first, then re-run this script,"
  echo "    otherwise the 'refused' step below has nothing to refuse."
  echo
else
  echo "  Currently checked out by: $LOCKED"
  echo
fi

current_rev() {
  curl -s "$API/api/documents/$DOC" -H "Authorization: Bearer $ADMIN" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["document"]["revision"])'
}

echo "--- Arjun attempts to save ---"
REV=$(current_rev)
RESP=$(curl -s -X POST "$API/api/documents/$DOC/save" -H "Authorization: Bearer $ARJUN" \
  -H 'Content-Type: application/json' \
  -d "{\"baseRevision\":$REV,\"content\":{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Arjun overwrite\"}]}]}}")
echo "    server said: $RESP"
python3 -c '
import sys, json
r = json.loads(sys.argv[1])
if r.get("ok"):
    print("    -> ACCEPTED (nobody held the lock, so this was a legitimate save)")
elif r.get("code") == "locked_by_other":
    print("    -> REFUSED: " + str(r.get("lockedBy")) + " has it checked out. This is the point.")
elif r.get("code") == "stale":
    print("    -> REFUSED: based on an old revision (current is v" + str(r.get("currentRevision")) + ").")
' "$RESP"

echo
echo "--- Admin force check-in, then saves a real revision ---"
curl -s -X POST "$API/api/documents/$DOC/unlock" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"force":true}' > /dev/null
curl -s -X POST "$API/api/documents/$DOC/lock" -H "Authorization: Bearer $ADMIN" > /dev/null
REV=$(current_rev)   # re-read: the attempt above may have moved it
RESP=$(curl -s -X POST "$API/api/documents/$DOC/save" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d "{\"baseRevision\":$REV,\"content\":{\"type\":\"doc\",\"content\":[{\"type\":\"heading\",\"attrs\":{\"level\":1},\"content\":[{\"type\":\"text\",\"text\":\"Control of Drug Product\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Assay acceptance criterion revised to 95.0-105.0% following QA review.\"}]}]},\"reason\":\"QA correction after review\"}")
echo "    server said: $RESP"
curl -s -X POST "$API/api/documents/$DOC/unlock" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"force":true}' > /dev/null

echo
echo "Now look at the AmFile window — the banner should name System Administrator,"
echo "and the tree revision should have increased."
