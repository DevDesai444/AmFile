export interface PageSetup {
  size: 'A4' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginTopMm: number
  marginBottomMm: number
  marginLeftMm: number
  marginRightMm: number
  columns: number
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  marginTopMm: 25.4,
  marginBottomMm: 25.4,
  marginLeftMm: 25.4,
  marginRightMm: 25.4,
  columns: 1
}

/** A minimal ProseMirror/Tiptap JSON node — kept structural (not the full Tiptap type)
 *  so main-process docx services don't need to import the renderer's editor package. */
export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
  content?: PMNode[]
}

export interface AmFileDocumentModel {
  title: string
  content: PMNode
  pageSetup: PageSetup
  header: PMNode | null
  footer: PMNode | null
}

export function emptyDocumentModel(title: string): AmFileDocumentModel {
  return {
    title,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    pageSetup: DEFAULT_PAGE_SETUP,
    header: null,
    footer: null
  }
}
