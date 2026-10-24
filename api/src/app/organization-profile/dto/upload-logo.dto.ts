import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export class UploadLogoDto {
  @IsNotEmpty()
  @IsString()
  fileBase64!: string;

  @IsNotEmpty()
  @IsIn(LOGO_MIMES)
  mimeType!: (typeof LOGO_MIMES)[number];
}
