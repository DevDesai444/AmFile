import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  InsertedTextRun,
  DeletedTextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  ExternalHyperlink,
  AlignmentType,
  WidthType,
  convertMillimetersToTwip,
  PageOrientation,
  Header,
  Footer
} from 'docx'
import type { IPropertiesOptions } from 'docx'
import type { AmFileDocumentModel, PMNode } from './model'

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

type DocxRun = TextRun | InsertedTextRun | DeletedTextRun | ExternalHyperlink

function runsFromInline(nodes: PMNode[] | undefined): DocxRun[] {
  if (!nodes) return []
  const out: DocxRun[] = []
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }))
      continue
    }
    if (node.type !== 'text' || !node.text) continue
    const marks = node.marks ?? []
    const bold = marks.some((m) => m.type === 'bold')
    const italics = marks.some((m) => m.type === 'italic')
    const underline = marks.some((m) => m.type === 'underline') ? {} : undefined
    const strike = marks.some((m) => m.type === 'strike')
    const subScript = marks.some((m) => m.type === 'subscript')
    const superScript = marks.some((m) => m.type === 'superscript')
    const link = marks.find((m) => m.type === 'link')
    const insertion = marks.find((m) => m.type === 'insertion')
    const deletion = marks.find((m) => m.type === 'deletion')

    const opts = { text: node.text, bold, italics, underline, strike, subScript, superScript }

    let run: DocxRun
    if (deletion) {
      run = new DeletedTextRun({
        ...opts,
        text: undefined as never,
        children: [node.text],
        author: String(deletion.attrs?.authorName ?? 'Reviewer'),
        date: String(deletion.attrs?.timestamp ?? new Date().toISOString())
      } as never)
    } else if (insertion) {
      run = new InsertedTextRun({
        ...opts,
        text: undefined as never,
        children: [node.text],
        author: String(insertion.attrs?.authorName ?? 'Reviewer'),
        date: String(insertion.attrs?.timestamp ?? new Date().toISOString())
      } as never)
    } else {
      run = new TextRun(opts)
    }

    if (link) {
      out.push(
        new ExternalHyperlink({
          link: String(link.attrs?.href ?? '#'),
          children: [run as TextRun]
        })
      )
    } else {
      out.push(run)
    }
  }
  return out
}

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}

function blockToDocx(node: PMNode): Array<Paragraph | Table> {
  switch (node.type) {
    case 'paragraph': {
      const align = node.attrs?.textAlign as string | undefined
      return [
        new Paragraph({
          alignment: align ? ALIGN_MAP[align] : undefined,
          children: runsFromInline(node.content)
        })
      ]
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6)
      return [
        new Paragraph({
          heading: HEADING_LEVELS[level - 1],
          children: runsFromInline(node.content)
        })
      ]
    }
    case 'bulletList':
      return (node.content ?? []).flatMap((li) => listItemToDocx(li, 'bullet'))
    case 'orderedList':
      return (node.content ?? []).flatMap((li) => listItemToDocx(li, 'number'))
    case 'blockquote':
      return (node.content ?? []).flatMap((child) => blockToDocx(child)).filter((n): n is Paragraph => n instanceof Paragraph)
    case 'table': {
      const rows = (node.content ?? []).map(
        (row) =>
          new TableRow({
            children: (row.content ?? []).map(
              (cell) =>
                new TableCell({
                  width: { size: 100 / (row.content?.length || 1), type: WidthType.PERCENTAGE },
                  children: (cell.content ?? []).flatMap((c) => blockToDocx(c)).filter((n): n is Paragraph => n instanceof Paragraph)
                })
            )
          })
      )
      return [new Table({ rows })]
    }
    case 'image': {
      return [
        new Paragraph({
          children: node.attrs?.src
            ? [
                new ImageRun({
                  type: 'png',
                  data: Buffer.from(String(node.attrs.src).split(',')[1] ?? '', 'base64'),
                  transformation: { width: 400, height: 300 }
                })
              ]
            : []
        })
      ]
    }
    default:
      return []
  }
}

function listItemToDocx(li: PMNode, kind: 'bullet' | 'number'): Paragraph[] {
  return (li.content ?? []).flatMap((child) => {
    if (child.type !== 'paragraph') return blockToDocx(child).filter((n): n is Paragraph => n instanceof Paragraph)
    return [
      new Paragraph({
        bullet: kind === 'bullet' ? { level: 0 } : undefined,
        numbering: kind === 'number' ? { reference: 'amfile-numbering', level: 0 } : undefined,
        children: runsFromInline(child.content)
      })
    ]
  })
}

export async function exportDocx(model: AmFileDocumentModel): Promise<Buffer> {
  const children = (model.content.content ?? []).flatMap((node) => blockToDocx(node))

  const sectionProperties: IPropertiesOptions['sections'][number]['properties'] = {
    page: {
      size: {
        width: convertMillimetersToTwip(model.pageSetup.size === 'A4' ? 210 : 215.9),
        height: convertMillimetersToTwip(model.pageSetup.size === 'A4' ? 297 : 279.4),
        orientation: model.pageSetup.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
      },
      margin: {
        top: convertMillimetersToTwip(model.pageSetup.marginTopMm),
        bottom: convertMillimetersToTwip(model.pageSetup.marginBottomMm),
        left: convertMillimetersToTwip(model.pageSetup.marginLeftMm),
        right: convertMillimetersToTwip(model.pageSetup.marginRightMm)
      }
    }
  }

  const headerParagraphs = model.header
    ? (model.header.content ?? []).flatMap((n) => blockToDocx(n)).filter((n): n is Paragraph => n instanceof Paragraph)
    : []
  const footerParagraphs = model.footer
    ? (model.footer.content ?? []).flatMap((n) => blockToDocx(n)).filter((n): n is Paragraph => n instanceof Paragraph)
    : []

  const doc = new Document({
    title: model.title,
    numbering: {
      config: [
        {
          reference: 'amfile-numbering',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }]
        }
      ]
    },
    sections: [
      {
        properties: sectionProperties,
        headers: headerParagraphs.length ? { default: new Header({ children: headerParagraphs }) } : undefined,
        footers: footerParagraphs.length ? { default: new Footer({ children: footerParagraphs }) } : undefined,
        children
      }
    ]
  })

  return Packer.toBuffer(doc)
}
