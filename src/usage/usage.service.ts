import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';

@Injectable() export class UsageService {
    constructor(
        private readonly prisma: PrismaService
    ) {}

    async getByUserId(userId: string) {
        return this.prisma.usage.findUnique({
            where: { userId },
        })
    }

    async canUseChat(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user) return false

        if (user.plan === 'PREMIUM') return true

        const usage = await this.getByUserId(userId)

        if (!usage) return false

        return usage.questionsUsed < 5
    }

    /**
     * Bloqueia o chat do usuário por N horas (padrão 12). Persistido no banco
     * para o bloqueio sobreviver a reinícios do servidor.
     */
    async block(userId: string, horas = 12) {
        const blockedUntil = new Date(Date.now() + horas * 60 * 60 * 1000)
        return this.prisma.usage.update({
            where: { userId },
            data: { blockedUntil },
        })
    }

    /** Retorna a data de desbloqueio se houver bloqueio ATIVO; senão null. */
    async getBlockedUntil(userId: string): Promise<Date | null> {
        const usage = await this.getByUserId(userId)
        const until = usage?.blockedUntil ?? null
        return until && until.getTime() > Date.now() ? until : null
    }

    async increment(userId: string) {
        return this.prisma.usage.update({
            where: { userId },
            data: {
                questionsUsed: {
                    increment: 1
                }
            }
        })
    }
}
