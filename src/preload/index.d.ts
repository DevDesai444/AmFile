import type { AmFileApi } from './index'

declare global {
  interface Window {
    amfile: AmFileApi
  }
}

export {}
