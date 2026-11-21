import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'dbmapper-theme'

export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function resolveTheme(stored: Theme | null): Theme {
  return stored ?? systemTheme()
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function initTheme(): Theme {
  const theme = resolveTheme(readStoredTheme())
  applyTheme(theme)
  return theme
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Preferência indisponível (modo privado, storage bloqueado): segue só na sessão.
  }
}

export interface ThemeController {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export function useTheme(): ThemeController {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(readStoredTheme()))
  const explicit = readStoredTheme() !== null

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (explicit) return
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media?.addEventListener) return
    const onChange = (event: MediaQueryListEvent) => setThemeState(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [explicit])

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next)
    applyTheme(next)
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      storeTheme(next)
      applyTheme(next)
      return next
    })
  }, [])

  return { theme, setTheme, toggleTheme }
}
