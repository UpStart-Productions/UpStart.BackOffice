import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { ClientFormsController } from './client-forms.controller';
import { FormDestinations } from './form-destinations';
import { FormFilesController } from './form-files.controller';
import { FormFilesService } from './form-files.service';
import { FormLinksService } from './form-links.service';
import { FormEmbedController, FormPublicController, FormResultsController } from './form-public.controller';
import { FormPublicService } from './form-public.service';
import { FormResponsesServiceController } from './form-responses-service.controller';
import { FormStructureService } from './form-structure.service';
import { FreeFormDestination } from './free-form-destination';
import { FreeFormsController } from './free-forms.controller';

/**
 * Form engine (core, always on): form structure, builder profiles, checking answers, scoring, public links,
 * and the Forms area (free-standing forms). Modules that need forms import this and register a destination.
 */
@Module({
  imports: [NotificationsModule, ServiceKeysModule],
  controllers: [ClientFormsController, FormFilesController, FormPublicController, FormResultsController, FormEmbedController, FreeFormsController, FormResponsesServiceController],
  providers: [FormFilesService, FormStructureService, FormLinksService, FormPublicService, FormDestinations, FreeFormDestination],
  exports: [FormFilesService, FormStructureService, FormLinksService, FormDestinations],
})
export class FormsModule {}
