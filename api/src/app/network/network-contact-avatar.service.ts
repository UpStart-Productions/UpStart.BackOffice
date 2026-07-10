import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageResizeService } from '../storage/image-resize.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { UploadAvatarDto } from '../users/dto/user.dto';
import { toStaffNetworkContactView } from './network-contact.util';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

@Injectable()
export class NetworkContactAvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageResize: ImageResizeService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async upload(contactId: string, dto: UploadAvatarDto) {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid file data');
    }
    if (!buffer.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (buffer.length > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Image must be less than 5MB');
    }
    if (!ALLOWED_AVATAR_MIMES.includes(dto.mimeType)) {
      throw new BadRequestException('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    const existing = await this.prisma.networkContact.findUnique({
      where: { id: contactId },
      select: { id: true, companyId: true, avatarUrl: true },
    });
    if (!existing) throw new NotFoundException('Network contact not found');

    const processed = await this.imageResize.process(buffer, dto.mimeType, 'avatar');
    const filename = `${contactId}-${Date.now()}${processed.ext}`;
    const key = `network/${existing.companyId}/contacts/${contactId}/${filename}`;
    const url = await this.storage.upload({
      buffer: processed.buffer,
      key,
      mimeType: processed.mimeType,
    });

    if (existing.avatarUrl) {
      await this.deleteStoredAvatar(existing.avatarUrl);
    }

    const contact = await this.prisma.networkContact.update({
      where: { id: contactId },
      data: { avatarUrl: url },
    });

    return {
      url: toPublicAssetUrl(url) ?? url,
      contact: toStaffNetworkContactView(contact),
    };
  }

  async remove(contactId: string) {
    const existing = await this.prisma.networkContact.findUnique({
      where: { id: contactId },
      select: { avatarUrl: true },
    });
    if (!existing) throw new NotFoundException('Network contact not found');

    if (existing.avatarUrl) {
      await this.deleteStoredAvatar(existing.avatarUrl);
    }

    const contact = await this.prisma.networkContact.update({
      where: { id: contactId },
      data: { avatarUrl: null },
    });

    return { contact: toStaffNetworkContactView(contact) };
  }

  async deleteStoredAvatar(avatarUrl: string): Promise<void> {
    try {
      const key = this.storage.keyFromUrl(avatarUrl);
      if (key && !key.startsWith('http')) {
        await this.storage.delete(key);
      }
    } catch {
      /* best-effort cleanup */
    }
  }
}
