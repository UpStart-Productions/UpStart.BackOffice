import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateNetworkCompanyDto } from './create-network-company.dto';

export class UpdateNetworkCompanyDto extends PartialType(
  OmitType(CreateNetworkCompanyDto, ['primaryContact'] as const),
) {}
