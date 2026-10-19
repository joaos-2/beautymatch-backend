import axios from 'axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserProfile } from '@prisma/client'
import { CLASSIFY_INTENT_PROMPT } from './prompts/classify-intent.prompt'
import { EDUCATION_PROMPT } from './prompts/education.prompt'
import { RECOMMENDATION_PROMPT } from './prompts/recomendation.prompt'
import { PRODUCT_COMPARISON_PROMPT } from './prompts/comparison.prompt'
import { SEARCH_COMMENT_PROMPT } from './prompts/search-comment.prompt'
import { CANONIZE_TRENDS_PROMPT } from './prompts/canonize-trends.prompt'
import { GREETING_PROMPT } from './prompts/greeting.prompt'
import {
    SKIN_TYPE_PT, HAIR_TYPE_PT, BUDGET_PT, AGE_RANGE_PT, GENDER_PT,
    SKIN_CONCERN_PT, HAIR_CONCERN_PT, INGREDIENT_PT, SUN_EXPOSURE_PT,
    SCENT_PT, SKIN_TONE_PT, MAKEUP_COVERAGE_PT,
} from 'src/common/profile-labels'

export interface ChatMessage {
    role: string
    content: string
}

export interface TrendCandidate {
    id: number
    text: string
    categoryFromPrefix: string
}

export interface CanonizedTrend {
    id: number
    termo: string | null
    categoria: string | null
}

export interface ClassifyIntentResult {
    intent: string
    canonicalTerm: string | null
    category: string | null
    /** CHEAPEST | PREMIUM quando o usuário pede explicitamente; null é o padrão */
    pricePreference: string | null
}

@Injectable()
export class AiClient {
    private apiKey: string
    private model: string

    constructor(private readonly config: ConfigService) {
        this.apiKey = this.config.getOrThrow<string>('OPENROUTER_API_KEY')
        this.model = this.config.getOrThrow<string>('OPENROUTER_MODEL')
    }

    private async callOpenRouter(
        messages: ChatMessage[],
        temperature: number,
    ): Promise<string> {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            { model: this.model, messages, temperature },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'BeautyMatch',
                },
            },
        )
        return response.data.choices[0].message.content
    }

    private buildProfileText(profile: UserProfile | null): string {
        if (!profile) {
            return 'O usuário ainda não preencheu o perfil.'
        }

        const linhas: string[] = []
        const add = (rotulo: string, valor?: string | null) => {
            if (valor) linhas.push(`- ${rotulo}: ${valor}`)
        }
        const lista = <T extends string>(
            vals: T[] | null | undefined,
            mapa: Record<T, string>,
        ): string | null =>
            vals && vals.length ? vals.map((v) => mapa[v]).join(', ') : null

        add('Tipo de pele', profile.skinType ? SKIN_TYPE_PT[profile.skinType] : null)
        add('Tom de pele', profile.skinTone ? SKIN_TONE_PT[profile.skinTone] : null)
        add('Tipo de cabelo', profile.hairType ? HAIR_TYPE_PT[profile.hairType] : null)
        add('Faixa etária', profile.ageRange ? AGE_RANGE_PT[profile.ageRange] : null)
        add('Gênero', profile.gender ? GENDER_PT[profile.gender] : null)
        add('Orçamento', profile.budget ? BUDGET_PT[profile.budget] : null)
        add('Preocupações de pele', lista(profile.skinConcerns, SKIN_CONCERN_PT))
        add('Preocupações de cabelo', lista(profile.hairConcerns, HAIR_CONCERN_PT))
        add('Exposição ao sol', profile.sunExposure ? SUN_EXPOSURE_PT[profile.sunExposure] : null)
        add('Preferência de fragrância', profile.scentPreference ? SCENT_PT[profile.scentPreference] : null)
        add('Cobertura de maquiagem', profile.makeupCoverage ? MAKEUP_COVERAGE_PT[profile.makeupCoverage] : null)

        if (profile.sensitiveSkin) linhas.push('- Pele sensível: sim')
        if (profile.veganOnly) linhas.push('- Prefere apenas produtos veganos: sim')

        // Ingredientes a evitar é uma restrição, não uma preferência: reforçamos.
        const evitar = lista(profile.ingredientsToAvoid, INGREDIENT_PT)
        if (evitar) {
            linhas.push(`- Ingredientes a EVITAR (nunca recomende produtos que os contenham): ${evitar}`)
        }

        if (linhas.length === 0) {
            return 'O usuário ainda não preencheu o perfil.'
        }

        return `Perfil do usuário:\n${linhas.join('\n')}`
    }

    async classifyIntent(message: string, history: ChatMessage[] = []): Promise<ClassifyIntentResult> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: CLASSIFY_INTENT_PROMPT },
                ...history,
                { role: 'user', content: message },
            ],
            0,
        )

        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim()
        return JSON.parse(clean)
    }

    /**
     * Temperatura alta de propósito: saudação repetida palavra por palavra denuncia
     * o robô. O histórico entra para a IA não se reapresentar a cada "oi".
     */
    async generateGreeting(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
    ): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: GREETING_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                ...history,
                { role: 'user', content: message },
            ],
            1,
        )
        return content.trim()
    }

    async generateEducation(message: string, history: ChatMessage[] = []): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: EDUCATION_PROMPT },
                ...history,
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }

    /**
     * Quem decide o que está em alta é o backend; a IA só recebe os termos como
     * informação de contexto, no mesmo padrão do perfil.
     */
    private buildTrendingText(terms: string[]): string {
        if (terms.length === 0) {
            return 'Não há termos em alta para citar agora.'
        }

        return `Termos de beleza em alta no momento: ${terms.join(', ')}.`
    }

    async generateRecommendation(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
        trendingTerms: string[] = [],
    ): Promise<string> {
        // Quando o perfil já tem o essencial, NÃO reenviamos os turnos da conversa:
        // se o histórico recente tiver respostas de "pergunta", o modelo IMITA e volta
        // a perguntar tipo de pele/orçamento que o perfil já traz. Sem os turnos + uma
        // instrução direta, ele recomenda de cara usando o perfil.
        const perfilCompleto = !!(
            profile && (profile.skinType || profile.hairType || profile.budget)
        )

        const messages: ChatMessage[] = [
            { role: 'system', content: RECOMMENDATION_PROMPT },
            { role: 'system', content: this.buildProfileText(profile) },
            { role: 'system', content: this.buildTrendingText(trendingTerms) },
            ...(perfilCompleto ? [] : history),
        ]

        if (perfilCompleto) {
            messages.push({
                role: 'system',
                content:
                    'O perfil acima já contém os dados necessários. Faça a recomendação ' +
                    'AGORA com base nele. NÃO pergunte tipo de pele, tipo de cabelo nem ' +
                    'orçamento — você já tem essas informações. Só pergunte se faltar um ' +
                    'detalhe que o perfil realmente não cobre (ex.: preferência de ' +
                    'fragrância para perfume) e, mesmo assim, já dê uma sugestão.',
            })
        }

        messages.push({ role: 'user', content: message })

        const content = await this.callOpenRouter(messages, 0.7)
        return content.trim()
    }

    async generationComparison(
        message: string,
        profile: UserProfile | null,
        history: ChatMessage[] = [],
    ): Promise<string> {
        const content = await this.callOpenRouter(
            [
                { role: 'system', content: PRODUCT_COMPARISON_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                ...history,
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }


    async commentProducts(
        message: string,
        products: { title: string }[],
        profile: UserProfile | null,
    ): Promise<string> {
        // só os nomes vão para a IA: sem preço, ela não tem como citar preço
        const list = products
            .map((p, i) => `${i + 1}. ${p.title}`)
            .join('\n')

        const content = await this.callOpenRouter(
            [
                { role: 'system', content: SEARCH_COMMENT_PROMPT },
                { role: 'system', content: this.buildProfileText(profile) },
                { role: 'system', content: `Produtos encontrados:\n${list}` },
                { role: 'user', content: message },
            ],
            0.7,
        )
        return content.trim()
    }

    /**
     * Canoniza em UMA chamada todas as sugestões coletadas do autocomplete.
     * Roda no cron diário, fora do caminho do usuário — por isso o uso de LLM aqui
     * não conflita com a restrição do fingerprint de produto, que é síncrono e
     * precisa ser determinístico.
     */
    async canonizeTrendTerms(candidates: TrendCandidate[]): Promise<CanonizedTrend[]> {
        if (candidates.length === 0) return []

        const payload = candidates.map((c) => ({
            id: c.id,
            texto: c.text,
            categoria_origem: c.categoryFromPrefix,
        }))

        const content = await this.callOpenRouter(
            [
                { role: 'system', content: CANONIZE_TRENDS_PROMPT },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            0,
        )

        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(clean)

        return Array.isArray(parsed) ? parsed : []
    }
}
