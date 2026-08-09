import type { Editor } from '@tiptap/core'

/** Uses a plain HTML file input rather than an Electron dialog IPC round-trip — file
 *  reading happens entirely in the renderer via FileReader, no main-process access needed,
 *  and it works identically whether or not the Electron preload bridge is present. */
export function insertImage(editor: Editor): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/gif,image/webp'
  input.onchange = (): void => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      const src = reader.result as string
      editor.chain().focus().setImage({ src, alt: file.name }).run()
    }
    reader.readAsDataURL(file)
  }
  input.click()
}
