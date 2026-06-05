import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const KEY_PREFIX = 'ubo_';
const KEY_RANDOM_BYTES = 32;
const HASH_ALGORITHM = 'sha256';

@Injectable()
export class ServiceKeyService {
  constructor(private readonly prisma: PrismaService) {}

  private hashKey(plainKey: string): string {
    return createHash(HASH_ALGORITHM).update(plainKey).digest('hex');
  }

  /**
   * Generate a new named service key.
   * Returns the plain key — show it once, it cannot be retrieved again.
   */
  async generate(name: string): Promise<{ id: string; name: string; key: string; keyPrefix: string }> {
    const randomPart = randomBytes(KEY_RANDOM_BYTES).toString('base64url');
    const plainKey   = `${KEY_PREFIX}${randomPart}`;
    const keyHash    = this.hashKey(plainKey);
    const keyPrefix  = `${KEY_PREFIX}${randomPart.slice(0, 4)}...${randomPart.slice(-4)}`;

    const record = await this.prisma.serviceKey.create({
      data: { name, keyHash, keyPrefix },
    });

    return { id: record.id, name: record.name, key: plainKey, keyPrefix };
  }

  /**
   * Validate an incoming key. Returns the service key record (minus hash)
   * and bumps lastUsedAt. Returns null if invalid or inactive.
   */
  async validate(plainKey: string): Promise<{ id: string; name: string } | null> {
    if (!plainKey?.startsWith(KEY_PREFIX)) return null;

    const keyHash = this.hashKey(plainKey);
    const record  = await this.prisma.serviceKey.findFirst({
      where: { keyHash, isActive: true },
      select: { id: true, name: true },
    });
    if (!record) return null;

    // Fire-and-forget lastUsedAt update — don't block the request
    void this.prisma.serviceKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    return record;
  }

  /** List all keys (masked — plain key never returned after creation). */
  async list() {
    return this.prisma.serviceKey.findMany({
      select: {
        id:         true,
        name:       true,
        keyPrefix:  true,
        isActive:   true,
        lastUsedAt: true,
        createdAt:  true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Soft-revoke: mark isActive = false. */
  async revoke(id: string): Promise<void> {
    await this.prisma.serviceKey.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
