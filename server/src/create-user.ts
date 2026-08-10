import { query, queryOne } from './db.js'
import { hashPassword, passwordProblem, type Role } from './auth.js'
import { writeAudit } from './audit.js'

/**
 * Create or update a user account.
 *
 * Credentials are taken from argv/env and never written to disk, so no real password ends up
 * in the repository or in a committed seed file.
 *
 *   npx tsx src/create-user.ts <email> <"Display Name"> <role[,role]> [--force-weak]
 *
 * The password is read from AMFILE_NEW_PASSWORD.
 */
const VALID_ROLES: Role[] = ['author', 'reviewer', 'approver', 'admin']

async function main(): Promise<void> {
  const [email, displayName, roleArg] = process.argv.slice(2)
  const forceWeak = process.argv.includes('--force-weak')
  const password = process.env.AMFILE_NEW_PASSWORD

  if (!email || !displayName || !roleArg || !password) {
    console.error('Usage: AMFILE_NEW_PASSWORD=... npx tsx src/create-user.ts <email> <"Name"> <roles>')
    console.error('Roles (comma separated): author, reviewer, approver, admin')
    process.exit(1)
  }

  const roles = roleArg.split(',').map((r) => r.trim()) as Role[]
  const bad = roles.filter((r) => !VALID_ROLES.includes(r))
  if (bad.length) {
    console.error(`Unknown role(s): ${bad.join(', ')}`)
    process.exit(1)
  }

  const problem = passwordProblem(password)
  if (problem && !forceWeak) {
    console.error(`Rejected: ${problem}`)
    console.error('Re-run with --force-weak to override (the account will still sign in, but the')
    console.error('same value would be refused by the in-app change-password screen).')
    process.exit(1)
  }
  if (problem && forceWeak) {
    console.warn(`WARNING: ${problem} Creating anyway because --force-weak was given.`)
  }

  const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [
    email.toLowerCase()
  ])

  let id: string
  if (existing) {
    id = existing.id
    await query(
      `UPDATE users SET password_hash = $2, password_updated_at = now(), display_name = $3,
         active = true, must_change_password = false, failed_login_count = 0, locked_until = NULL
       WHERE id = $1`,
      [id, await hashPassword(password), displayName]
    )
    console.log(`updated existing account ${email}`)
  } else {
    const row = await query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash, password_updated_at, must_change_password)
       VALUES ($1,$2,$3, now(), false) RETURNING id`,
      [email, displayName, await hashPassword(password)]
    )
    id = row[0].id
    console.log(`created account ${email}`)
  }

  for (const role of roles) {
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, role])
  }

  await writeAudit({
    userId: id,
    printedName: displayName,
    action: existing ? 'user.updated' : 'user.created',
    newValue: { email, roles }
  })

  console.log(`  name  : ${displayName}`)
  console.log(`  roles : ${roles.join(', ')}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
