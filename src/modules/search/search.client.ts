import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

@Injectable()
export class searchClient {
    private apiKey: string

    constructor(private readonly config: ConfigService) {
        this.apiKey = this.config.getOrThrow<string>('SERPER_DEV_KEY')
    }

    async searchShopping(query: string): Promise<any[]> {
        // A Serper falha de forma intermitente (rede/rate limit). Sem retry, um
        // hiccup vira "não consegui buscar" na cara do usuário. Tentamos algumas
        // vezes com backoff curto e um timeout por tentativa.
        const MAX_TENTATIVAS = 3
        let ultimoErro: unknown

        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
            try {
                const response = await axios.post(
                    'https://google.serper.dev/shopping',
                    { q: query, gl: 'br', hl: 'pt' },
                    {
                        headers: {
                            'X-API-KEY': this.apiKey,
                            'Content-Type': 'application/json',
                        },
                        timeout: 8000,
                    },
                )

                return response.data.shopping ?? []
            } catch (erro) {
                ultimoErro = erro
                if (tentativa < MAX_TENTATIVAS) {
                    await new Promise((r) => setTimeout(r, 300 * tentativa))
                }
            }
        }

        throw ultimoErro
    }

    async searchAutocomplete(query: string): Promise<string[]> {
        const response = await axios.post(
            'https://google.serper.dev/autocomplete',
            { q: query, gl: 'br', hl: 'pt-br' },
            {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Content-Type': 'application/json',
                }
            }
        )

        const suggestions = response.data.suggestions ?? []

        return suggestions
            .map((s: any) => s?.value)
            .filter((v: any): v is string => typeof v === 'string' && v.trim().length > 0)
    }
}