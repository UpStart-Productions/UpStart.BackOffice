import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { isBackOfficeRole } from '@upstart/back-office/shared';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { SubmitSupportFeedbackDto } from './dto/support-feedback.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** "Contact Support" from the help drawer: emails support@heyupstart.com with Reply-To set to the user. */
  @Post('feedback')
  submit(@Body() dto: SubmitSupportFeedbackDto, @Req() req: Request) {
    const user = req.user!;
    if (!isBackOfficeRole(user.role)) {
      throw new ForbiddenException('Support requests are only available in the back office.');
    }
    return this.support.submit({
      user,
      dto,
      userAgent: req.headers['user-agent'],
      impersonatedBy: req.impersonatedBy,
    });
  }
}
