import {
  Controller,
  Inject,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Request as Req } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { saveContentImage } from '../common/content-image.util';
import { saveContentFile } from '../common/content-file.util';
import { ImageResizeService } from '../storage/image-resize.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(AppAuthGuard)
export class ContentUploadsController {
  constructor(
    private readonly imageResize: ImageResizeService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Post('content-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadContentImage(
    @Request() req: Req,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size?: number } | undefined,
  ) {
    const url = await saveContentImage(this.imageResize, this.storage, req.user!.id, {
      buffer: file?.buffer ?? Buffer.alloc(0),
      mimetype: file?.mimetype ?? '',
      size: file?.size,
    });

    return { url };
  }

  @Post('content-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadContentFile(
    @Request() req: Req,
    @UploadedFile()
    file:
      | { buffer: Buffer; mimetype: string; size?: number; originalname?: string }
      | undefined,
  ) {
    return saveContentFile(this.storage, req.user!.id, {
      buffer: file?.buffer ?? Buffer.alloc(0),
      mimetype: file?.mimetype ?? '',
      size: file?.size,
      originalname: file?.originalname,
    });
  }
}
