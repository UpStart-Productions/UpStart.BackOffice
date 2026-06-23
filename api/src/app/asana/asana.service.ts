import { randomUUID } from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AsanaApiClient,
  AsanaOAuthConfig,
  buildAsanaAuthorizeUrl,
  defaultAsanaRedirectUri,
  exchangeAsanaCode,
  refreshAsanaToken,
} from './asana-api.client';
import { decryptSecret, encryptSecret } from './asana-crypto.util';
import { UpdateAsanaConfigDto } from './dto/update-asana-config.dto';

const INTEGRATION_ID = 'default';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type AsanaStatusDto = {
  connected: boolean;
  configured: boolean;
  workspaceName?: string | null;
  connectedByEmail?: string | null;
  connectedAt?: string | null;
};

export type AsanaConfigDto = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  suggestedRedirectUri: string;
};

@Injectable()
export class AsanaService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<AsanaStatusDto> {
    const row = await this.ensureIntegrationRow();
    return {
      configured: await this.isConfigured(),
      connected: !!(row.accessTokenEnc && row.refreshTokenEnc),
      workspaceName: row.workspaceName,
      connectedByEmail: row.connectedByEmail,
      connectedAt: row.connectedAt?.toISOString() ?? null,
    };
  }

  async getConfig(): Promise<AsanaConfigDto> {
    const row = await this.ensureIntegrationRow();
    return {
      clientId: row.clientId ?? '',
      redirectUri: row.redirectUri ?? defaultAsanaRedirectUri(),
      hasClientSecret: !!row.clientSecretEnc,
      suggestedRedirectUri: defaultAsanaRedirectUri(),
    };
  }

  async saveConfig(dto: UpdateAsanaConfigDto) {
    const row = await this.ensureIntegrationRow();
    if (!dto.clientSecret?.trim() && !row.clientSecretEnc) {
      throw new BadRequestException('Client secret is required');
    }

    const redirectUri = dto.redirectUri.trim();
    const clientId = dto.clientId.trim();

    await this.prisma.asanaIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        clientId,
        redirectUri,
        ...(dto.clientSecret?.trim()
          ? { clientSecretEnc: encryptSecret(dto.clientSecret.trim()) }
          : {}),
      },
    });

    return this.getConfig();
  }

  async isConfigured(): Promise<boolean> {
    const row = await this.ensureIntegrationRow();
    return !!(row.clientId?.trim() && row.clientSecretEnc && row.redirectUri?.trim());
  }

  async startConnect(connectedByEmail?: string): Promise<{ url: string }> {
    const config = await this.resolveOAuthConfig();
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    await this.prisma.asanaIntegration.upsert({
      where: { id: INTEGRATION_ID },
      create: {
        id: INTEGRATION_ID,
        pendingOAuthState: state,
        pendingOAuthStateExpiresAt: expiresAt,
        connectedByEmail: connectedByEmail ?? null,
      },
      update: {
        pendingOAuthState: state,
        pendingOAuthStateExpiresAt: expiresAt,
        connectedByEmail: connectedByEmail ?? null,
      },
    });
    return { url: buildAsanaAuthorizeUrl(config, state) };
  }

  async completeConnect(code: string, state: string) {
    const row = await this.ensureIntegrationRow();
    if (!row.pendingOAuthState || row.pendingOAuthState !== state) {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (
      !row.pendingOAuthStateExpiresAt ||
      row.pendingOAuthStateExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('OAuth state expired — try connecting again');
    }

    const config = await this.resolveOAuthConfig();
    const token = await exchangeAsanaCode(config, code);
    const expiresAt = new Date(Date.now() + token.expires_in * 1000);
    const api = new AsanaApiClient(token.access_token);
    const workspaces = token.data?.workspaces?.length
      ? token.data.workspaces
      : await api.listWorkspaces();
    const workspace = workspaces[0];
    if (!workspace) {
      throw new BadGatewayException('No Asana workspace found for this account');
    }

    await this.prisma.asanaIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(token.refresh_token),
        tokenExpiresAt: expiresAt,
        workspaceGid: workspace.gid,
        workspaceName: workspace.name,
        connectedAt: new Date(),
        pendingOAuthState: null,
        pendingOAuthStateExpiresAt: null,
      },
    });
  }

  async disconnect() {
    await this.prisma.asanaIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        workspaceGid: null,
        workspaceName: null,
        connectedByEmail: null,
        connectedAt: null,
        pendingOAuthState: null,
        pendingOAuthStateExpiresAt: null,
      },
    });
  }

  async getApiClient(): Promise<AsanaApiClient> {
    const row = await this.ensureIntegrationRow();
    if (!row.accessTokenEnc || !row.refreshTokenEnc) {
      throw new UnauthorizedException('Asana is not connected');
    }

    const config = await this.resolveOAuthConfig();
    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = decryptSecret(row.accessTokenEnc);
      refreshToken = decryptSecret(row.refreshTokenEnc);
    } catch {
      throw new UnauthorizedException(
        'Asana credentials could not be read — disconnect and connect again in Settings',
      );
    }
    const needsRefresh =
      !row.tokenExpiresAt ||
      row.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh) {
      const refreshed = await refreshAsanaToken(config, refreshToken);
      if (!refreshed.access_token) {
        throw new UnauthorizedException(
          'Asana token refresh failed — disconnect and connect again in Settings',
        );
      }
      accessToken = refreshed.access_token;
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await this.prisma.asanaIntegration.update({
        where: { id: INTEGRATION_ID },
        data: {
          accessTokenEnc: encryptSecret(refreshed.access_token),
          ...(refreshed.refresh_token
            ? { refreshTokenEnc: encryptSecret(refreshed.refresh_token) }
            : {}),
          tokenExpiresAt: expiresAt,
        },
      });
    }

    return new AsanaApiClient(accessToken);
  }

  async listProjects() {
    const row = await this.ensureIntegrationRow();
    if (!row.workspaceGid) {
      throw new UnauthorizedException('Asana is not connected');
    }
    const client = await this.getApiClient();
    return client.listProjects(row.workspaceGid);
  }

  async listSections(projectGid: string) {
    const client = await this.getApiClient();
    return client.listSections(projectGid);
  }

  async getTaskNotes(taskGid: string) {
    const client = await this.getApiClient();
    return client.getTaskNotes(taskGid);
  }

  private async resolveOAuthConfig(): Promise<AsanaOAuthConfig> {
    const row = await this.ensureIntegrationRow();
    if (!row.clientId?.trim() || !row.clientSecretEnc || !row.redirectUri?.trim()) {
      throw new BadGatewayException('Asana app credentials are not configured — add them in Settings');
    }
    return {
      clientId: row.clientId.trim(),
      clientSecret: decryptSecret(row.clientSecretEnc),
      redirectUri: row.redirectUri.trim(),
    };
  }

  private async ensureIntegrationRow() {
    return this.prisma.asanaIntegration.upsert({
      where: { id: INTEGRATION_ID },
      create: { id: INTEGRATION_ID },
      update: {},
    });
  }
}
