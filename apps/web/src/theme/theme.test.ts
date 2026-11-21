import { afterEach, describe, expect, test } from 'bun:test'
import {
  applyTheme,
  initTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemTheme,
  THEME_STORAGE_KEY,
} from './theme'

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  window.matchMedia = originalMatchMedia
})

function stubSystemTheme(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}

describe('theme', () => {
  test('preferência salva prevalece sobre o sistema', () => {
    stubSystemTheme(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(readStoredTheme()).toBe('light')
    expect(resolveTheme(readStoredTheme())).toBe('light')
  })

  test('sem preferência salva segue o sistema', () => {
    stubSystemTheme(true)
    expect(readStoredTheme()).toBeNull()
    expect(systemTheme()).toBe('dark')
    expect(resolveTheme(null)).toBe('dark')
  })

  test('storage indisponível não bloqueia a troca de tema', () => {
    const original = window.localStorage.setItem.bind(window.localStorage)
    const getOriginal = window.localStorage.getItem.bind(window.localStorage)
    Object.defineProperty(window.localStorage, 'setItem', {
      value: () => {
        throw new Error('storage bloqueado')
      },
      configurable: true,
    })
    Object.defineProperty(window.localStorage, 'getItem', {
      value: () => {
        throw new Error('storage bloqueado')
      },
      configurable: true,
    })

    expect(readStoredTheme()).toBeNull()
    expect(() => storeTheme('dark')).not.toThrow()

    Object.defineProperty(window.localStorage, 'setItem', { value: original, configurable: true })
    Object.defineProperty(window.localStorage, 'getItem', { value: getOriginal, configurable: true })
  })

  test('applyTheme e initTheme gravam o atributo data-theme', () => {
    stubSystemTheme(false)
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    document.documentElement.removeAttribute('data-theme')
    storeTheme('light')
    expect(initTheme()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
