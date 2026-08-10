import { query, queryOne } from './db.js'
import { writeAudit } from './audit.js'
import { contentHash } from './documents.js'

/**
 * Folder structure with deliberately uneven access, so permissions are demonstrable rather
 * than theoretical: Arjun can only read Module 3, and Sara cannot see the Confidential folder
 * at all.
 */
const STRUCTURE = [
  {
    name: 'ANDA 217-445 — Rivastigmine TDS',
    children: [
      { name: 'Module 3 — Quality', docs: ['3.2.P.1 Description', '3.2.P.3 Manufacture', '3.2.P.5 Control of Drug Product', '3.2.P.8 Stability'] },
      { name: 'Module 2 — Summaries', docs: ['2.3 Quality Overall Summary'] },
      { name: 'Confidential — Pricing', docs: ['Cost of Goods Analysis'] }
    ]
  }
]

async function userId(email: string): Promise<string> {
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])
  if (!row) throw new Error(`missing user ${email}`)
  return row.id
}

async function main(): Promise<void> {
  const dev = await userId('devdesai@amneal.com')
  const riya = await userId('riya.patel@amneal.com')
  const arjun = await userId('arjun.mehta@amneal.com')
  const sara = await userId('sara.khan@amneal.com')

  for (const root of STRUCTURE) {
    let rootId = (await queryOne<{ id: string }>('SELECT id FROM folders WHERE name = $1 AND parent_id IS NULL', [root.name]))?.id
    if (!rootId) {
      rootId = (
        await query<{ id: string }>('INSERT INTO folders (name, parent_id, created_by) VALUES ($1,NULL,$2) RETURNING id', [
          root.name,
          dev
        ])
      )[0].id
      console.log(`folder  ${root.name}`)
    }
    // Riya owns the submission; the others are granted per sub-folder below.
    await query(
      `INSERT INTO folder_permissions (folder_id, user_id, access, granted_by) VALUES ($1,$2,'owner',$3)
       ON CONFLICT (folder_id, user_id) DO UPDATE SET access='owner'`,
      [rootId, riya, dev]
    )

    for (const child of root.children) {
      let childId = (await queryOne<{ id: string }>('SELECT id FROM folders WHERE name = $1 AND parent_id = $2', [child.name, rootId]))?.id
      if (!childId) {
        childId = (
          await query<{ id: string }>('INSERT INTO folders (name, parent_id, created_by) VALUES ($1,$2,$3) RETURNING id', [
            child.name,
            rootId,
            dev
          ])
        )[0].id
        console.log(`  folder  ${child.name}`)
      }

      if (child.name.startsWith('Module 3')) {
        // Arjun: read-only here. He inherits nothing else, so this is his only folder.
        await query(
          `INSERT INTO folder_permissions (folder_id, user_id, access, granted_by) VALUES ($1,$2,'viewer',$3)
           ON CONFLICT (folder_id, user_id) DO UPDATE SET access='viewer'`,
          [childId, arjun, dev]
        )
        await query(
          `INSERT INTO folder_permissions (folder_id, user_id, access, granted_by) VALUES ($1,$2,'editor',$3)
           ON CONFLICT (folder_id, user_id) DO UPDATE SET access='editor'`,
          [childId, sara, dev]
        )
      }
      if (child.name.startsWith('Module 2')) {
        await query(
          `INSERT INTO folder_permissions (folder_id, user_id, access, granted_by) VALUES ($1,$2,'editor',$3)
           ON CONFLICT (folder_id, user_id) DO UPDATE SET access='editor'`,
          [childId, sara, dev]
        )
      }
      // Confidential gets no extra grants: only Riya (owner, inherited) and admins.

      for (const docName of child.docs) {
        const path = `${docName}.docx`
        const exists = await queryOne<{ id: string }>('SELECT id FROM documents WHERE folder_id = $1 AND path = $2', [
          childId,
          path
        ])
        if (exists) continue
        const content = {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: docName }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Draft content. Edit and save to create a new revision.' }] }
          ]
        }
        const docId = (
          await query<{ id: string }>(
            'INSERT INTO documents (path, title, created_by, current_revision, folder_id) VALUES ($1,$2,$3,1,$4) RETURNING id',
            [path, docName, riya, childId]
          )
        )[0].id
        await query(
          `INSERT INTO document_revisions (document_id, revision, content, content_hash, page_setup, author_id)
           VALUES ($1,1,$2,$3,$4,$5)`,
          [
            docId,
            JSON.stringify(content),
            contentHash(content),
            JSON.stringify({ size: 'A4', orientation: 'portrait', marginTopMm: 25.4, marginBottomMm: 25.4, marginLeftMm: 25.4, marginRightMm: 25.4, columns: 1 }),
            riya
          ]
        )
        await writeAudit({ userId: riya, printedName: 'Riya Patel', action: 'document.created', documentId: docId, revisionAfter: 1 })
        console.log(`    doc   ${path}`)
      }
    }
  }

  console.log('\nAccess summary:')
  console.log('  Dev Desai   admin  -> everything')
  console.log('  Riya Patel  owner  -> whole submission, including Confidential')
  console.log('  Sara Khan   editor -> Module 3 and Module 2, cannot see Confidential')
  console.log('  Arjun Mehta viewer -> Module 3 only, read-only, cannot see anything else')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
