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
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { projectRootPrefix } from '../storage/storage-keys.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateArtifactDto } from './dto/create-artifact.dto';
import { UpdateArtifactDto } from './dto/update-artifact.dto';
import { extname } from 'path';
import { randomUUID } from 'crypto';

type ArtifactParent = {
  leadId?: string;
  clientId?: string;
  projectId?: string;
  networkCompanyId?: string;
  networkContactId?: string;
};

@ApiTags('artifacts')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiQuery({ name: 'leadId', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'networkCompanyId', required: false })
  @ApiQuery({ name: 'networkContactId', required: false })
  async list(
    @Query('leadId') leadId?: string,
    @Query('clientId') clientId?: string,
    @Query('projectId') projectId?: string,
    @Query('networkCompanyId') networkCompanyId?: string,
    @Query('networkContactId') networkContactId?: string,
  ) {
    const parent = this.resolveParent({ leadId, clientId, projectId, networkCompanyId, networkContactId });
    return this.prisma.artifact.findMany({
      where: parent,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateArtifactDto) {
    const parent = this.resolveParent({
      leadId: dto.leadId,
      clientId: dto.clientId,
      projectId: dto.projectId,
      networkCompanyId: dto.networkCompanyId,
      networkContactId: dto.networkContactId,
    });
    return this.prisma.artifact.create({
      data: {
        ...parent,
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
    @Query('projectId') projectId?: string,
    @Query('networkCompanyId') networkCompanyId?: string,
    @Query('networkContactId') networkContactId?: string,
  ) {
    const parent = this.resolveParent({ leadId, clientId, projectId, networkCompanyId, networkContactId });
    if (!file) throw new BadRequestException('file is required');

    const folder = await this.uploadFolder(parent);
    const ext = extname(file.originalname);
    const key = `${folder}/artifacts/${randomUUID()}${ext}`;

    await this.storage.upload({ buffer: file.buffer, key, mimeType: file.mimetype });

    return this.prisma.artifact.create({
      data: {
        ...parent,
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

  private resolveParent(parent: ArtifactParent): ArtifactParent {
    const keys = (
      ['leadId', 'clientId', 'projectId', 'networkCompanyId', 'networkContactId'] as const
    ).filter((key) => parent[key]);
    if (keys.length !== 1) {
      throw new BadRequestException(
        'Exactly one of leadId, clientId, projectId, networkCompanyId, or networkContactId required',
      );
    }
    return { [keys[0]]: parent[keys[0]] };
  }

  private async uploadFolder(parent: ArtifactParent): Promise<string> {
    if (parent.leadId) return `leads/${parent.leadId}`;
    if (parent.clientId) return `clients/${parent.clientId}`;
    if (parent.networkCompanyId) return `network/${parent.networkCompanyId}`;
    if (parent.networkContactId) {
      const contact = await this.prisma.networkContact.findUnique({
        where: { id: parent.networkContactId },
      });
      if (!contact) throw new NotFoundException('Network contact not found');
      return `network/${contact.companyId}/contacts/${contact.id}`;
    }
    if (parent.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: parent.projectId } });
      if (!project) throw new NotFoundException('Project not found');
      return projectRootPrefix(project.clientId, parent.projectId);
    }
    throw new BadRequestException(
      'Exactly one of leadId, clientId, projectId, networkCompanyId, or networkContactId required',
    );
  }
}
