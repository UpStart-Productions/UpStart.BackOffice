import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import {
  AddContactEmailDto, CreateContactDto, LinkContactAccountDto, UpdateContactDto,
} from './dto/communications.dto';
import { InteractionsService } from './interactions.service';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { ImageResizeService } from '../storage/image-resize.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { UploadAvatarDto } from '../users/dto/user.dto';

const ALLOWED_AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly interactions: InteractionsService,
    private readonly imageResize: ImageResizeService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** ?q= search, ?clientId= filter, ?tag= CRM tag, ?review=true for auto-created contacts awaiting review. */
  @Get()
  list(
    @Query('q') q?: string,
    @Query('clientId') clientId?: string,
    @Query('review') review?: string,
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contacts.list({ q, clientId, review: review === 'true', tag, limit });
  }

  /** Auto-created contacts awaiting review (drives the Contacts nav badge). Declared before :id. */
  @Get('review/count')
  reviewCount() {
    return this.contacts.reviewCount();
  }

  @Post()
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.contacts.get(id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.interactions.contactTimeline(id, { limit, before });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Action('edit')
  @Post(':id/avatar')
  async uploadAvatar(@Param('id') id: string, @Body() dto: UploadAvatarDto) {
    await this.contacts.get(id);
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid file data');
    }
    if (!buffer.length) throw new BadRequestException('No file uploaded');
    if (buffer.length > AVATAR_MAX_BYTES) throw new BadRequestException('Image must be less than 5MB');
    if (!ALLOWED_AVATAR_MIMES.includes(dto.mimeType)) {
      throw new BadRequestException('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    const existing = await this.contacts.get(id);
    const processed = await this.imageResize.process(buffer, dto.mimeType, 'avatar');
    const filename = `${id}-${Date.now()}${processed.ext}`;
    const key = `contacts/${id}/${filename}`;
    const url = await this.storage.upload({
      buffer: processed.buffer,
      key,
      mimeType: processed.mimeType,
    });

    if (existing.avatarUrl) {
      try {
        const oldKey = this.storage.keyFromUrl(existing.avatarUrl);
        if (oldKey && !oldKey.startsWith('http')) await this.storage.delete(oldKey);
      } catch {
        /* best-effort */
      }
    }

    return this.contacts.update(id, { avatarUrl: url });
  }

  @Action('edit')
  @Post(':id/emails')
  addEmail(@Param('id') id: string, @Body() dto: AddContactEmailDto) {
    return this.contacts.addEmail(id, dto);
  }

  @Action('edit')
  @Delete(':id/emails/:email')
  removeEmail(@Param('id') id: string, @Param('email') email: string) {
    return this.contacts.removeEmail(id, email);
  }

  @Action('edit')
  @Post(':id/accounts')
  linkAccount(@Param('id') id: string, @Body() dto: LinkContactAccountDto) {
    return this.contacts.linkAccount(id, dto);
  }

  @Action('edit')
  @Delete(':id/accounts/:clientId')
  unlinkAccount(@Param('id') id: string, @Param('clientId') clientId: string) {
    return this.contacts.unlinkAccount(id, clientId);
  }
}
