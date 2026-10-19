import { Injectable, Logger } from '@nestjs/common'
import { ProductCategory, UserProfile } from '@prisma/client'
import { searchClient } from './search.client'
import { AiClient } from '../ai/ai.client'

export interface Product {
    title: string
    price: string
    priceValue: number
    source: string
    link: string
    imageUrl: string
    /** nota de avaliação da loja, quando existe — base do filtro "mais recomendado" */
    rating: number | null
    ratingCount: number | null
    /** colocação original no Google Shopping — a ordem de relevância deles */
    relevance: number | null
    /** chave de produto do Google, usada depois no histórico de preço */
    productId: string | null
    /**
     * Nota ajustada pela confiança: é por este campo que o front ordena
     * "mais recomendado". Ver calcularRecomendacao.
     */
    recommendationScore: number
}

/** Como o usuário pediu que a lista fosse ordenada. */
export type PricePreference = 'CHEAPEST' | 'PREMIUM'

/** Quantos produtos voltam na resposta, para o front poder filtrar sem nova busca. */
const LIMITE_RETORNO = 20

/** Quantos entram no comentário da IA — o card de destaque mostra poucos. */
const LIMITE_COMENTARIO = 5

/**
 * Palavra que desfaz a ambiguidade do termo na busca.
 *
 * "shampoo" sozinho no Google Shopping devolve shampoo automotivo, e "sabonete"
 * devolve sabão de louça. A categoria já foi classificada — basta usá-la.
 */
const QUALIFICADOR: Record<ProductCategory, string> = {
    CABELO: 'cabelo',
    SKINCARE_FACIAL: 'facial',
    CORPO: 'corporal',
    MAQUIAGEM: 'maquiagem',
    PROTECAO_SOLAR: 'protetor solar',
    PERFUMARIA: 'perfume',
}

/** Rede de segurança: título que caia fora de beleza é descartado. */
const FORA_DE_BELEZA = [
    'automotiv', 'autoamerica', 'carro', 'veicul', 'lava-auto', 'lava auto',
    'off road', 'moto ', 'pneu', 'roda ',
    'louça', 'louca', 'piso', 'roupa', 'tecido', 'amaciante', 'desinfetante',
    'cachorro', 'gato', 'pet ', 'canino', 'felino',
]

@Injectable()
export class ProductSearchService {
    private readonly logger = new Logger(ProductSearchService.name)

    constructor(
        private readonly searchClient: searchClient,
        private readonly aiClient: AiClient,
    ) {}

    /**
     * Monta a query enviada ao Google a partir do termo canônico.
     *
     * O termo canônico continua sendo o que ele é — a chave de agregação do trending.
     * Aqui ele só ganha o contexto de beleza que a busca precisa, quando ainda não o tem.
     */
    buildSearchQuery(term: string, category: ProductCategory | null): string {
        const base = term.trim()

        if (!category) return base

        // Só desambigua termo de UMA palavra. "shampoo" sozinho traz produto
        // automotivo e precisa do reforço; "shampoo anticaspa" já se explica, e colar
        // uma palavra a mais só mexeria no resultado sem necessidade.
        if (base.split(/\s+/).length > 1) return base

        const qualificador = QUALIFICADOR[category]

        if (!qualificador || base.includes(qualificador)) return base

        return `${base} ${qualificador}`
    }

    /**
     * Média bayesiana: puxa a nota na direção da média geral com força proporcional
     * à falta de avaliações.
     *
     * Ordenar por nota crua faria "5,0 com 1 avaliação" ganhar de "4,9 com 179" — o
     * filtro pareceria funcionar e estaria promovendo o item menos confiável. Aqui o
     * produto de nota alta só sobe de verdade quando tem gente suficiente confirmando.
     * Sem nota, fica na média: nem promovido, nem enterrado.
     */
    private calcularRecomendacao(
        rating: number | null,
        count: number | null,
        mediaGeral: number,
    ): number {
        const PESO_CONFIANCA = 20

        if (rating === null || !count) return mediaGeral

        return (rating * count + mediaGeral * PESO_CONFIANCA) / (count + PESO_CONFIANCA)
    }

    private ehDeBeleza(title?: string): boolean {
        if (!title) return false

        const t = title.toLowerCase()

        return !FORA_DE_BELEZA.some((termo) => t.includes(termo))
    }

    async search(
        term: string,
        category: ProductCategory | null,
        profile: UserProfile | null,
        pricePreference: PricePreference = 'CHEAPEST',
    ): Promise<{ query: string; reply: string; products: Product[] }> {
        const query = this.buildSearchQuery(term, category)

        let raw: any[] = []
        try {
            raw = await this.searchClient.searchShopping(query)
        } catch (error) {
            this.logger.error('Erro na busca da Serper', error)
            return {
                query,
                reply: 'Não consegui buscar produtos agora. Tente novamente em instantes.',
                products: [],
            }
        }

        const notas = raw
            .map((i) => i.rating)
            .filter((r): r is number => typeof r === 'number')

        const mediaGeral = notas.length
            ? notas.reduce((s, n) => s + n, 0) / notas.length
            : 0

        const products: Product[] = raw
            .filter((item) => this.ehDeBeleza(item.title))
            .map((item) => ({
                title: item.title,
                price: item.price,
                priceValue: this.parsePrice(item.price),
                source: item.source,
                // O link cru da Serper é uma URL 'ibp=oshop' (oferta anotada) que
                // NÃO abre no Chrome real ("detalhes do produto não estão disponíveis").
                // Em vez dela, apontamos para a busca do Google Shopping pelo título:
                // abre sempre e lista as ofertas do produto. Fallback: link cru.
                link: item.title
                    ? `https://www.google.com/search?q=${encodeURIComponent(item.title)}&udm=28`
                    : item.link,
                imageUrl: item.imageUrl,
                rating: typeof item.rating === 'number' ? item.rating : null,
                ratingCount: typeof item.ratingCount === 'number' ? item.ratingCount : null,
                relevance: typeof item.position === 'number' ? item.position : null,
                productId: item.productId ?? null,
                recommendationScore: this.calcularRecomendacao(
                    typeof item.rating === 'number' ? item.rating : null,
                    typeof item.ratingCount === 'number' ? item.ratingCount : null,
                    mediaGeral,
                ),
            }))
            .filter((p): p is Product => p.priceValue !== null)

        // o padrão é o mais barato, mas pedido explícito do usuário vence o padrão
        products.sort((a, b) =>
            pricePreference === 'PREMIUM'
                ? b.priceValue - a.priceValue
                : a.priceValue - b.priceValue,
        )

        // Devolve um conjunto maior do que a tela mostra de primeira.
        //
        // O filtro do frontend ("menor preço", "maior preço", "mais recomendado")
        // reordena essa lista no cliente, sem nova chamada. Se devolvêssemos só 5 já
        // cortados, ordenar por "maior preço" daria o mais caro ENTRE os cinco mais
        // baratos — o filtro pareceria funcionar e estaria mentindo.
        const encontrados = products.slice(0, LIMITE_RETORNO)

        if (encontrados.length === 0) {
            return {
                query,
                reply: 'Não encontrei produtos para essa busca. Pode descrever de outro jeito?',
                products: [],
            }
        }

        // fallback sem preço, caso a IA falhe
        let reply = 'Encontrei estas opções pra você. Confira a lista abaixo!'
        try {
            reply = await this.aiClient.commentProducts(
                term,
                encontrados.slice(0, LIMITE_COMENTARIO),
                profile,
            )
        } catch (error) {
            this.logger.error('Erro ao comentar produtos', error)
        }

        return { query, reply, products: encontrados }
    }

    private parsePrice(price?: string): number | null {
        if (!price) return null

        const cleaned = price
            .replace('R$', '')
            .replace(/\./g, '')
            .replace(',', '.')
            .trim()

        const value = parseFloat(cleaned)
        return isNaN(value) ? null : value
    }
}
