import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FormDestinations } from './form-destinations';
import { FormLinksService } from './form-links.service';
import { FormEmbedController, FormPublicController, FormResultsController } from './form-public.controller';
import { FormPublicService } from './form-public.service';
import { FormStructureService } from './form-structure.service';
import { FreeFormDestination } from './free-form-destination';
import { FreeFormsController } from './free-forms.controller';

/**
 * Form engine (core, always on): form structure, builder profiles, checking answers, scoring, public links,
 * and the Forms area (free-standing forms). Modules that need forms import this and register a destination.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [FormPublicController, FormResultsController, FormEmbedController, FreeFormsController],
  providers: [FormStructureService, FormLinksService, FormPublicService, FormDestinations, FreeFormDestination],
  exports: [FormStructureService, FormLinksService, FormDestinations],
})
export class FormsModule {}
