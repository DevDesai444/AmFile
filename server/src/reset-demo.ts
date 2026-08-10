import { pool } from './db.js'

/**
 * Wipes and rebuilds the append-only tables for a clean demo or test run.
 *
 * This deliberately requires table ownership: the append-only triggers stop UPDATE, DELETE
 * and TRUNCATE, so the only way past them is to drop and recreate the tables. That is the
 * honest shape of the control — it cannot be defeated by the application or by an ordinary
 * user, only by someone with owner rights on the database.
 *
 * NEVER run this against an instance holding real records. It exists because `aip-amn-dev`
 * is a development workspace.
 */
async function main(): Promise<void> {
  if (process.env.AMFILE_ALLOW_RESET !== 'yes') {
    console.error('Refusing to run. Set AMFILE_ALLOW_RESET=yes to confirm this is a dev database.')
    process.exit(1)
  }

  // Full clean slate: tables, enum types and trigger functions, so migrations 001..003 can
  // be replayed from scratch without collisions.
  await pool.query(`
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS signatures CASCADE;
    DROP TABLE IF EXISTS comments CASCADE;
    DROP TABLE IF EXISTS document_locks CASCADE;
    DROP TABLE IF EXISTS document_revisions CASCADE;
    DROP TABLE IF EXISTS documents CASCADE;
    DROP TABLE IF EXISTS login_attempts CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS user_roles CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TYPE  IF EXISTS amfile_role CASCADE;
    DROP TYPE  IF EXISTS amfile_signature_meaning CASCADE;
    DROP FUNCTION IF EXISTS amfile_deny_mutation() CASCADE;
    DROP FUNCTION IF EXISTS amfile_deny_truncate() CASCADE;
  `)
  console.log('dropped all AmFile tables, types and trigger functions')
  console.log('now re-run migrations 001..003 and then `npm run seed`')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
