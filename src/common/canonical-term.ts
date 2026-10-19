import { ProductCategory } from '@prisma/client'
import { Intent } from 'src/modules/ai/enums/intent.enums'

export function normalizeIntent(intent: unknown): Intent {
    if (typeof intent !== 'string') return Intent.OUT_OF_SCOPE

    const valid = Object.values(Intent) as string[]

    return valid.includes(intent) ? (intent as Intent) : Intent.OUT_OF_SCOPE
}

export function normalizeCanonicalTerm(term: unknown): string | null {
    if (typeof term !== 'string') return null

    const clean = term
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .slice(0, 120)
        .trim()

    return clean.length > 0 ? clean : null
}

/**
 * Preposições e artigos removidos para alinhar o vocabulário dos dois sinais:
 * o autocomplete devolve "shampoo para cabelo oleoso" e o classificador devolve
 * "shampoo cabelo oleoso". Sem isso, o mesmo termo vira dois grupos no GROUP BY.
 */
const STOPWORDS = new Set([
    'para', 'de', 'do', 'da', 'dos', 'das', 'com', 'e', 'o', 'a', 'os', 'as',
    'em', 'no', 'na', 'nos', 'nas', 'pra', 'por', 'que', 'quem', 'ao', 'aos',
])

/**
 * Guarda-corpo determinístico sobre o termo já canonizado pela IA.
 *
 * Só garante consistência mecânica — não comprime significado. Truncar em N
 * palavras corta justamente a palavra que distingue os termos ("protetor solar
 * facial pele seca" e "... pele oleosa" virariam o mesmo grupo), então termo fora
 * do tamanho aceitável é descartado em vez de cortado.
 */
export function normalizeTrendTerm(term: unknown): string | null {
    const base = normalizeCanonicalTerm(term)

    if (!base) return null

    const tokens = base.split(' ').filter((t) => t.length > 0 && !STOPWORDS.has(t))

    if (tokens.length < 2 || tokens.length > 6) return null

    return tokens.join(' ').slice(0, 120).trim()
}

/**
 * Preferência de ordenação pedida pelo usuário. Sem pedido explícito, o padrão do
 * produto é o mais barato — é a proposta do BeautyMatch.
 */
export function normalizePricePreference(
    value: unknown,
): 'CHEAPEST' | 'PREMIUM' | null {
    if (value === 'PREMIUM') return 'PREMIUM'
    if (value === 'CHEAPEST') return 'CHEAPEST'
    return null
}

export function normalizeCategory(category: unknown): ProductCategory | null {
    if (typeof category !== 'string') return null

    const valid = Object.values(ProductCategory) as string[]

    return valid.includes(category) ? (category as ProductCategory) : null
}