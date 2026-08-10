import { query, queryOne } from './db.js'
import { hashPassword } from './auth.js'
import { writeAudit } from './audit.js'

/**
 * Demo accounts. Passwords are set here deliberately so the demo is reproducible; these are
 * not production credentials and every account is flagged must_change_password.
 */
const USERS: Array<{ email: string; name: string; password: string; roles: string[] }> = [
  { email: 'riya.patel@amneal.com', name: 'Riya Patel', password: 'AmFile2026!', roles: ['author', 'reviewer'] },
  { email: 'arjun.mehta@amneal.com', name: 'Arjun Mehta', password: 'AmFile2026!', roles: ['author'] },
  { email: 'sara.khan@amneal.com', name: 'Sara Khan', password: 'AmFile2026!', roles: ['reviewer', 'approver'] },
  { email: 'admin@amneal.com', name: 'System Administrator', password: 'AmFile2026!', roles: ['admin', 'author'] }
]

const DOCS: Array<{ path: string; title: string }> = [
  { path: '3.2.P.1 Description.docx', title: 'Description and Composition' },
  { path: '3.2.P.3 Manufacture.docx', title: 'Manufacture' },
  { path: '3.2.P.5 Control of Drug Product.docx', title: 'Control of Drug Product' },
  { path: '3.2.P.8 Stability.docx', title: 'Stability' }
]

async function main(): Promise<void> {
  for (const u of USERS) {
    const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [
      u.email.toLowerCase()
    ])
    let id: string
    if (existing) {
      id = existing.id
      await query(
        'UPDATE users SET password_hash = $2, password_updated_at = now(), display_name = $3, active = true WHERE id = $1',
        [id, await hashPassword(u.password), u.name]
      )
    } else {
      const row = await query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash, password_updated_at, must_change_password)
         VALUES ($1,$2,$3, now(), true) RETURNING id`,
        [u.email, u.name, await hashPassword(u.password)]
      )
      id = row[0].id
    }
    for (const role of u.roles) {
      await query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, role])
    }
    console.log(`user  ${u.email.padEnd(28)} roles=${u.roles.join(',')}`)
  }

  const author = await queryOne<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM users WHERE lower(email) = 'riya.patel@amneal.com'"
  )
  if (!author) throw new Error('seed author missing')

  for (const d of DOCS) {
    const existing = await queryOne<{ id: string }>('SELECT id FROM documents WHERE path = $1', [d.path])
    if (existing) {
      console.log(`doc   ${d.path} (exists)`)
      continue
    }
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: d.title }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Draft content. Edit and save to create a new revision.' }]
        }
      ]
    }
    const inserted = await query<{ id: string }>(
      'INSERT INTO documents (path, title, created_by, current_revision) VALUES ($1,$2,$3,1) RETURNING id',
      [d.path, d.title, author.id]
    )
    const id = inserted[0].id
    const { createHash } = await import('node:crypto')
    await query(
      `INSERT INTO document_revisions (document_id, revision, content, content_hash, page_setup, author_id)
       VALUES ($1,1,$2,$3,$4,$5)`,
      [
        id,
        JSON.stringify(content),
        createHash('sha256').update(JSON.stringify(content)).digest('hex'),
        JSON.stringify({
          size: 'A4',
          orientation: 'portrait',
          marginTopMm: 25.4,
          marginBottomMm: 25.4,
          marginLeftMm: 25.4,
          marginRightMm: 25.4,
          columns: 1
        }),
        author.id
      ]
    )
    await writeAudit({
      userId: author.id,
      printedName: author.display_name,
      action: 'document.created',
      documentId: id,
      revisionAfter: 1
    })
    console.log(`doc   ${d.path} (created)`)
  }

  console.log('\nSeed complete. Sign in with any address above, password: AmFile2026!')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
