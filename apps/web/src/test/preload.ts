import { GlobalRegistrator } from '@happy-dom/global-registrator'

const NATIVE_GLOBAL_KEYS = [
  'fetch',
  'Request',
  'Response',
  'Headers',
  'Blob',
  'URL',
  'URLSearchParams',
  'WebSocket',
  'AbortController',
  'AbortSignal',
  'crypto',
  'TextEncoder',
  'TextDecoder',
  'atob',
  'btoa',
  'performance',
] as const

const globals = globalThis as Record<string, unknown>
const nativeGlobals: Record<string, unknown> = {}

for (const key of NATIVE_GLOBAL_KEYS) {
  nativeGlobals[key] = globals[key]
}

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register()
}

for (const [key, value] of Object.entries(nativeGlobals)) {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  } catch {
    globals[key] = value
  }
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

await import('@testing-library/react')
