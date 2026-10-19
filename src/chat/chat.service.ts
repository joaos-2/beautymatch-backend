import { Injectable, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common'
import { UsageService } from '../usage/usage.service'
import { PrismaService } from 'src/modules/prisma/prisma.service'
import { AiClient } from 'src/modules/ai/ai.client'
import { Product, ProductSearchService } from 'src/modules/search/product-search.service'
import {
  normalizeCanonicalTerm,
  normalizeCategory,
  normalizeIntent,
  normalizePricePreference,
} from 'src/common/canonical-term'
import { ProductCategory } from '@prisma/client'
import { Intent } from 'src/modules/ai/enums/intent.enums'
import { TrendsService } from 'src/modules/trends/trends.service'

/**
 * Só as intenções que realmente consomem trabalho de IA consomem crédito.
 * Saudação e fora de escopo são gratuitas: cobrar por uma recusa é punir o usuário
 * por um pedido que o sistema decidiu não atender.
 */
const INTENTS_COBRAVEIS = new Set<Intent>([
  Intent.PRODUCT_SEARCH,
  Intent.RECOMMENDATION,
  Intent.EDUCATION,
  Intent.PRODUCT_COMPARISON,
])

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
    private readonly aiClient: AiClient,
    private readonly productSearchService: ProductSearchService,
    private readonly trendsService: TrendsService,
  ) {}

  async handleMessage(userId: string, message: string) {
    // 0. bloqueio por abuso: se o usuário levou o ban de 12h (rajada detectada
    // pelo UserThrottlerGuard), corta aqui ANTES de qualquer chamada de LLM.
    const bloqueadoAte = await this.usageService.getBlockedUntil(userId)
    if (bloqueadoAte) {
      throw new HttpException(
        {
          message:
            'Seu acesso ao chat está temporariamente bloqueado por excesso de requisições.',
          blockedUntil: bloqueadoAte,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    // O limite NÃO é checado aqui: sem saber a intenção ainda, um usuário no limite
    // levaria 403 até para dizer "oi". A verificação acontece depois da classificação,
    // e só para as intenções cobráveis.

    // 1. buscar usuário com perfil
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    })

    if (!user) {
      throw new ForbiddenException('Usuário não encontrado')
    }

    // 3. buscar histórico recente
    const history = await this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // montar os turnos de conversa (do mais antigo pro mais novo), só os que têm resposta
    const historyMessages = [...history]
      .reverse()
      .filter((h) => h.reply)
      .flatMap((h) => [
        { role: 'user', content: h.query },
        { role: 'assistant', content: h.reply as string },
      ])

      let intent: Intent = Intent.OUT_OF_SCOPE
      let canonicalTerm: string | null = null
      let category: ProductCategory | null = null
      let pricePreference: 'CHEAPEST' | 'PREMIUM' | null = null

      // O classificador NÃO recebe turnos de conversa — recebe uma nota de contexto.
      //
      // Passar histórico como diálogo faz o modelo IMITAR o padrão em vez de consultá-lo,
      // e o viés é simétrico: com várias saudações no histórico, "oi, queria um shampoo"
      // virava GREETING; com várias buscas, "bom dia" virava PRODUCT_SEARCH. Em ambos os
      // casos o assunto anterior atropelava o conteúdo da mensagem nova.
      //
      // Ele usa o histórico para uma coisa só: resolver referência ("tem algum mais
      // barato?"). Para isso basta saber o último tópico, dito como informação.
      const ultimoRegistro = history.find((h) => h.canonicalTerm)
      const ultimoTopico = ultimoRegistro?.canonicalTerm

      const contextoClassificacao = ultimoTopico
        ? [{
            role: 'system',
            content:
              `Contexto: o último produto/assunto do usuário foi "${ultimoTopico}". ` +
              `Se a mensagem atual for uma referência ("ele", "esse", "e o outro"), um ` +
              `pedido de variação (acabamento, cor, textura, tamanho, tipo) ou um pedido ` +
              `de preço ("mais barato", "mais caro", "em conta"), ela fala do MESMO ` +
              `produto: o canonicalTerm DEVE ser "${ultimoTopico}" (combinado com o que a ` +
              `mensagem acrescentar) e NUNCA null. Ex.: "tem algum mais barato?" => ` +
              `canonicalTerm "${ultimoTopico}"; "quero um cremoso" => "${ultimoTopico} ` +
              `cremoso". Só ignore este contexto se a mensagem nomear um produto DIFERENTE. ` +
              `Este contexto vale APENAS para beleza: se a mensagem qualificar o assunto ` +
              `como algo que NÃO é beleza de uso pessoal (objeto, ferramenta, uso ` +
              `industrial, casa, ambiente, carro, animal — ex.: "escova industrial", ` +
              `"escova de aço", "escova de vaso"), classifique como OUT_OF_SCOPE com ` +
              `canonicalTerm e category null, ignorando este contexto.`,
          }]
        : []

      try {
        const result = await this.aiClient.classifyIntent(message, contextoClassificacao)

        intent = normalizeIntent(result?.intent)

        if (
          intent === Intent.PRODUCT_SEARCH ||
          intent === Intent.RECOMMENDATION ||
          intent === Intent.PRODUCT_COMPARISON
        ) {
          canonicalTerm = normalizeCanonicalTerm(result?.canonicalTerm)
          category = normalizeCategory(result?.category)
          pricePreference = normalizePricePreference(result?.pricePreference)
        }
      } catch (error) {
        console.error('AI error:', error)
        intent = Intent.OUT_OF_SCOPE
      }

    // agora que a intenção é conhecida, o limite vale só para o que é cobrável
    const cobravel = INTENTS_COBRAVEIS.has(intent)

    if (cobravel && !(await this.usageService.canUseChat(userId))) {
      throw new ForbiddenException(
        'Limite de perguntas atingido. Faça upgrade para continuar.',
      )
    }

    let reply: string

    let products: Product[] = []

    // termos em alta devolvidos como dado, para o front renderizar como sugestões
    // clicáveis — o clique reaproveita o fluxo de PRODUCT_SEARCH
    let trending: string[] = []

    switch (intent) {
      case Intent.GREETING:
        reply = await this.aiClient.generateGreeting(message, user.profile, historyMessages)
          break

      case Intent.OUT_OF_SCOPE:
        reply = 'Desculpe, só posso ajudar com assuntos de beleza - skincare, maquiagem, cabelo, perfumaria e cuidados pessoais.'
          break

      case Intent.EDUCATION:
        reply = await this.aiClient.generateEducation(message, historyMessages)
          break

      case Intent.RECOMMENDATION: {
        // se a leitura falhar, a recomendação continua normalmente sem os termos
        try {
          const rising = await this.trendsService.getRising(category ?? undefined, 5)
          trending = rising.map((t) => t.term)
        } catch (error) {
          console.error('Trends error:', error)
        }

        // os termos vão também para a IA: quando ela encaixa um na resposta o texto
        // fica mais natural, mas isso é bônus — a entrega garantida é o campo trending
        reply = await this.aiClient.generateRecommendation(
          message,
          user.profile,
          historyMessages,
          trending,
        )
        break
      }

      case Intent.PRODUCT_COMPARISON:
        reply = await this.aiClient.generationComparison(message, user.profile, historyMessages)
          break

      case Intent.PRODUCT_SEARCH: {
        // Backstop de contexto: se o classificador não extraiu o termo (ex.: "quero
        // um mais barato" — só referência/variação de preço), reaproveita o último
        // produto da conversa. Garante o follow-up mesmo quando o prompt vacila.
        const termoAnterior = ultimoRegistro?.canonicalTerm
        if (!canonicalTerm && termoAnterior) {
          canonicalTerm = termoAnterior
          category = category ?? ultimoRegistro?.category ?? null
        }

        // sem termo canônico não há o que buscar — só acontece se a IA falhar
        if (!canonicalTerm) {
          reply = 'Não entendi qual produto você procura. Pode dizer de outro jeito?'
          break
        }

        // preferência de preço: o pedido explícito da mensagem vence; se não
        // houver, cai no orçamento do perfil (ALTO => mais caro primeiro, BAIXO
        // => mais barato); na ausência de ambos, o padrão é o mais barato.
        const orcamentoPref =
          user.profile?.budget === 'HIGH'
            ? 'PREMIUM'
            : user.profile?.budget === 'LOW'
              ? 'CHEAPEST'
              : null
        const precoPref = pricePreference ?? orcamentoPref ?? 'CHEAPEST'

        // Presente para outra pessoa: não faz sentido personalizar pelo perfil de
        // quem compra ("batom que combina com você" ao presentear a mãe). Detecta
        // marcadores de terceiro e, nesse caso, busca sem o perfil do comprador.
        const alvo = message
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        const paraTerceiro =
          /\bpresente/.test(alvo) ||
          /\b(para|pra)\s+(a |o )?(minha|meu|uma|um|a|o)\s+(mae|pai|irma|irmao|amiga|amigo|namorada|namorado|esposa|marido|filha|filho|avo|tia|tio|prima|primo|sogra|sogro|colega|chefe|professora|professor)\b/.test(alvo) ||
          /\b(para|pra)\s+(ela|ele)\b/.test(alvo)
        const perfilBusca = paraTerceiro ? null : user.profile

        const result = await this.productSearchService.search(
          canonicalTerm,
          category,
          perfilBusca,
          precoPref,
        )
        reply = result.reply
        products = result.products
        break
      }

    default:
      reply = 'Entendi sua intenção, mas ainda estou aprendendo a responder esse tipo de pedido.'
        break
    }

    // 5. salvar pergunta
    await this.prisma.searchHistory.create({
      data: {
        userId,
        query: message,
        intent,
        reply,
        canonicalTerm,
        category,
      },
    })

    // 6. incrementar uso apenas quando a intenção for cobrável
    if (cobravel) {
      await this.usageService.increment(userId)
    }

    // 7. resposta (V1 simples)
    return {
      intent,
      reply,
      products,
      trending,
      context: {
        profile: user.profile,
        history,
      },
    }
  }
}