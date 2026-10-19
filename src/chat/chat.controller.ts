import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from 'src/common/guards/user-throttler.guard';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @UseGuards(JwtAuthGuard, UserThrottlerGuard)
    @Post()
    async send(
        @Req() req: Request,
        @Body() dto: SendMessageDto,
    ) {
        const userId = (req.user as any).userId

        return this.chatService.handleMessage(userId, dto.message)
    }
}
