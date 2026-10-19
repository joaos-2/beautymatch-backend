import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SearchHistoryModule } from './search-history/search-history.module';
import { UsageService } from './usage/usage.service';
import { ChatModule } from './chat/chat.module';
import { UsageModule } from './usage/usage.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TrendsModule } from './modules/trends/trends.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), ThrottlerModule.forRoot([
    // Anti-abuso em três janelas; estourar QUALQUER uma dispara o ban de 12h
    // (ver UserThrottlerGuard). A curta pega rajada; a média e a diária pegam
    // o "flood lento" (mandar oi a cada poucos segundos sem estourar o minuto).
    { name: 'curto', ttl: 60000, limit: 20 },      // 20 req / minuto
    { name: 'medio', ttl: 3600000, limit: 150 },   // 150 req / hora
    { name: 'dia', ttl: 86400000, limit: 400 },    // 400 req / dia
  ]), PrismaModule, UsersModule, AuthModule, ProfileModule, SearchHistoryModule, ChatModule, UsageModule, TrendsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
