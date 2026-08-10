import { session } from 'electron'

/**
 * Content-Security-Policy for the renderer.
 *
 * Sent as a header rather than the `<meta>` tag it replaces. A meta policy only governs what
 * comes after it in the document, and Vite injects its dev preamble above it, so the tag
 * silently failed to cover the very thing a strict policy exists for.
 *
 * The only host the app talks to is GitHub. There is no AmFile server, so there is no address
 * to configure and nothing else to allow.
 */
const GITHUB = 'https://api.github.com https://github.com https://avatars.githubusercontent.com'

function cspFor(): string {
  const dev = process.env.ELECTRON_RENDERER_URL
  const devSources = dev ? ` ${dev} ${dev.replace(/^http/, 'ws')}` : ''

  // `@vitejs/plugin-react` injects an inline Fast Refresh preamble, so the dev renderer cannot
  // run under a strict script-src. The packaged app has no preamble and keeps the strict
  // policy, which is the one that matters.
  const scriptSrc = dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'"

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self' ${GITHUB}${devSources}`
  ].join('; ')
}

export function applyCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspFor()]
      }
    })
  })
}
