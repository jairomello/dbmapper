import { z } from 'zod'

const suggestionSchema = z
  .object({
    item: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })
  .strict()

const responseSchema = z.object({
  suggestions: z.array(z.unknown()).catch([]),
})

export interface ParsedSuggestion {
  item: string
  description: string
}

export interface ParsedSuggestions {
  suggestions: ParsedSuggestion[]
  skipped: number
}

function stripCodeFences(raw: string): string {
  return raw.replace(/```[a-zA-Z0-9_-]*\s*/g, '').replace(/```/g, '').trim()
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return raw.slice(start, index + 1)
    }
  }

  return null
}

export function parseSuggestions(raw: string, allowedItems: ReadonlySet<string>): ParsedSuggestions {
  const candidate = extractFirstJsonObject(stripCodeFences(raw))
  if (!candidate) return { suggestions: [], skipped: 0 }

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return { suggestions: [], skipped: 0 }
  }

  const response = responseSchema.safeParse(parsed)
  if (!response.success) return { suggestions: [], skipped: 0 }

  const suggestions: ParsedSuggestion[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const entry of response.data.suggestions) {
    const suggestion = suggestionSchema.safeParse(entry)
    if (!suggestion.success) {
      skipped += 1
      continue
    }

    if (!allowedItems.has(suggestion.data.item) || seen.has(suggestion.data.item)) {
      skipped += 1
      continue
    }

    seen.add(suggestion.data.item)
    suggestions.push(suggestion.data)
  }

  return { suggestions, skipped }
}
