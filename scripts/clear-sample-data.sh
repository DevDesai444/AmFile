#!/usr/bin/env bash
#
# Remove the sample accounts and the sample folder tree, leaving your own account and
# anything you created.
#
# Users are DEACTIVATED rather than deleted: the audit trail references them, and
# 21 CFR 11.100(a) requires that an identity is never reused or reassigned. Deactivated
# accounts cannot sign in and do not appear in the "add someone" list.
set -euo pipefail

KEEP="${1:-devdesai@amneal.com}"
echo "Keeping: $KEEP"
echo

databricks psql amfile-dev -- -q <<SQL
-- Sample folders and everything inside them.
DELETE FROM folder_permissions
 WHERE folder_id IN (SELECT id FROM folders WHERE name LIKE 'ANDA 217-445%' OR name IN
       ('Module 3 — Quality','Module 2 — Summaries','Confidential — Pricing'));

UPDATE documents SET archived_at = now()
 WHERE folder_id IN (SELECT id FROM folders WHERE name LIKE 'ANDA 217-445%' OR name IN
       ('Module 3 — Quality','Module 2 — Summaries','Confidential — Pricing'));

UPDATE folders SET archived_at = now()
 WHERE name LIKE 'ANDA 217-445%' OR name IN
       ('Module 3 — Quality','Module 2 — Summaries','Confidential — Pricing');

-- Sample accounts: deactivate, revoke sessions, strip folder access.
UPDATE users SET active = false
 WHERE lower(email) <> lower('$KEEP')
   AND lower(email) IN ('riya.patel@amneal.com','arjun.mehta@amneal.com',
                        'sara.khan@amneal.com','admin@amneal.com',
                        'colleague.test@amneal.com');

UPDATE sessions SET revoked_at = now()
 WHERE user_id IN (SELECT id FROM users WHERE NOT active);

DELETE FROM folder_permissions
 WHERE user_id IN (SELECT id FROM users WHERE NOT active);

SELECT display_name AS "remaining active users", email FROM users WHERE active ORDER BY display_name;
SQL

echo
echo "Done. Sample folders archived, sample accounts deactivated."
echo "Your account and anything you created are untouched."
