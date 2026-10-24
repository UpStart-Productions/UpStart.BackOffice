import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import {
  AddContactEmailDto, CreateContactDto, LinkContactAccountDto, UpdateContactDto,
} from './dto/communications.dto';
import { InteractionsService } from './interactions.service';
import { AccessGuard, Area } from '../access/access.guard';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly interactions: InteractionsService,
  ) {}

  /** ?q= search, ?clientId= filter, ?review=true for auto-created contacts awaiting review. */
  @Get()
  list(
    @Query('q') q?: string,
    @Query('clientId') clientId?: string,
    @Query('review') review?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contacts.list({ q, clientId, review: review === 'true', limit });
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

  @Post(':id/emails')
  addEmail(@Param('id') id: string, @Body() dto: AddContactEmailDto) {
    return this.contacts.addEmail(id, dto);
  }

  @Delete(':id/emails/:email')
  removeEmail(@Param('id') id: string, @Param('email') email: string) {
    return this.contacts.removeEmail(id, email);
  }

  @Post(':id/accounts')
  linkAccount(@Param('id') id: string, @Body() dto: LinkContactAccountDto) {
    return this.contacts.linkAccount(id, dto);
  }

  @Delete(':id/accounts/:clientId')
  unlinkAccount(@Param('id') id: string, @Param('clientId') clientId: string) {
    return this.contacts.unlinkAccount(id, clientId);
  }
}
