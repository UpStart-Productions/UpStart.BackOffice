import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateArtifactDto } from './dto/create-artifact.dto';
import { UpdateArtifactDto } from './dto/update-artifact.dto';
import { extname } from 'path';
import { randomUUID } from 'crypto';

@ApiTags('artifacts')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Get()
  async list(@Query('leadId') leadId?: string, @Query('clientId') clientId?: string) {
    if (!leadId && !clientId) throw new BadRequestException('leadId or clientId required');
    return this.prisma.artifact.findMany({
      where: {
        ...(leadId ? { leadId } : {}),
        ...(clientId && !leadId ? { clientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateArtifactDto) {
    if (!dto.leadId && !dto.clientId) throw new BadRequestException('leadId or clientId required');
    return this.prisma.artifact.create({
      data: {
        leadId: dto.leadId,
        clientId: dto.clientId,
        type: dto.type,
        title: dto.title,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        url: dto.url,
        content: dto.content,
      },
    });
  }

  /** Upload a file and create a FILE artifact in one step */
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    @Query('leadId') leadId?: string,
    @Query('clientId') clientId?: string,
  ) {
    if (!leadId && !clientId) throw new BadRequestException('leadId or clientId required');
    if (!file) throw new BadRequestException('file is required');

    const folder = leadId ? `leads/${leadId}` : `clients/${clientId}`;
    const ext = extname(file.originalname);
    const key = `${folder}/artifacts/${randomUUID()}${ext}`;

    await this.storage.upload({ buffer: file.buffer, key, mimeType: file.mimetype });

    return this.prisma.artifact.create({
      data: {
        leadId,
        clientId,
        type: 'FILE',
        title: file.originalname,
        fileUrl: key,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateArtifactDto) {
    const existing = await this.prisma.artifact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Artifact not found');
    return this.prisma.artifact.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.content !== undefined && { content: dto.content }),
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.artifact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Artifact not found');
    if (existing.fileUrl) {
      await this.storage.delete(existing.fileUrl).catch(() => undefined);
    }
    await this.prisma.artifact.delete({ where: { id } });
    return { deleted: true };
  }
}
