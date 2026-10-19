import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerStorage,
} from '@nestjs/throttler'
import type { ThrottlerModuleOptions } from '@nestjs/throttler'
import { UsageService } from 'src/usage/usage.service'

const HORAS_BLOQUEIO = 12

/**
 * Limita a taxa de requisições POR USUÁRIO autenticado (não por IP, para que
 * vários alunos atrás do mesmo Wi-Fi não dividam o mesmo teto).
 *
 * Fecha a brecha em que intenções NÃO cobráveis (GREETING/OUT_OF_SCOPE), que não
 * incrementam a cota, podiam ser disparadas infinitamente gastando LLM. Quando o
 * usuário estoura a rajada (a "maldade"), em vez do 429 padrão marcamos um
 * bloqueio de 12h no banco e devolvemos uma mensagem clara.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly usage: UsageService,
  ) {
    super(options, storageService, reflector)
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.userId ?? req.ip
  }

  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const req = context.switchToHttp().getRequest()
    const userId = req.user?.userId
    const usage = userId ? await this.usage.block(userId, HORAS_BLOQUEIO) : null
    throw new HttpException(
      {
        message: `Detectamos muitas requisições em pouco tempo. Por segurança, seu acesso ao chat foi bloqueado por ${HORAS_BLOQUEIO} horas.`,
        blockedUntil: usage?.blockedUntil ?? null,
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}
