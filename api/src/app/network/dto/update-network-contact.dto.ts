import { PartialType } from '@nestjs/swagger';
import { CreateNetworkContactDto } from './create-network-contact.dto';

export class UpdateNetworkContactDto extends PartialType(CreateNetworkContactDto) {}
