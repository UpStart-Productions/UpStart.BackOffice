import { Injectable, Logger } from '@nestjs/common';
import {
  clientInvoicesPrefix,
  clientRootPrefix,
  FOLDER_PLACEHOLDER,
  invoicePdfKey,
  projectRootPrefix,
} from './storage-keys.util';
import { StorageService } from './storage.interface';

const PLACEHOLDER_BODY = Buffer.alloc(0);

@Injectable()
export class StorageFoldersService {
  private readonly logger = new Logger(StorageFoldersService.name);

  constructor(private readonly storage: StorageService) {}

  /** Create `clients/{id}/`, `clients/{id}/invoices/` placeholders. */
  async ensureClientFolders(clientId: string): Promise<void> {
    await this.ensurePlaceholder(`${clientRootPrefix(clientId)}/${FOLDER_PLACEHOLDER}`);
    await this.ensurePlaceholder(`${clientInvoicesPrefix(clientId)}/${FOLDER_PLACEHOLDER}`);
  }

  /** Create `clients/{clientId}/projects/{projectId}/` placeholder. */
  async ensureProjectFolder(clientId: string, projectId: string): Promise<void> {
    await this.ensurePlaceholder(`${projectRootPrefix(clientId, projectId)}/${FOLDER_PLACEHOLDER}`);
  }

  async removeClientTree(clientId: string): Promise<void> {
    await this.removePrefixSafe(clientRootPrefix(clientId));
  }

  async removeProjectTree(clientId: string, projectId: string): Promise<void> {
    await this.removePrefixSafe(projectRootPrefix(clientId, projectId));
  }

  async saveInvoicePdf(
    clientId: string,
    displayNumber: string,
    pdfBuffer: Buffer,
  ): Promise<string> {
    const key = invoicePdfKey(clientId, displayNumber);
    await this.storage.upload({
      buffer: pdfBuffer,
      key,
      mimeType: 'application/pdf',
    });
    return key;
  }

  async removeInvoicePdf(clientId: string, displayNumber: string): Promise<void> {
    const key = invoicePdfKey(clientId, displayNumber);
    try {
      if (await this.storage.exists(key)) {
        await this.storage.delete(key);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete invoice PDF ${key}: ${err}`);
    }
  }

  private async ensurePlaceholder(key: string): Promise<void> {
    try {
      if (await this.storage.exists(key)) return;
      await this.storage.upload({
        buffer: PLACEHOLDER_BODY,
        key,
        mimeType: 'text/plain',
      });
    } catch (err) {
      this.logger.warn(`Failed to create storage placeholder ${key}: ${err}`);
    }
  }

  private async removePrefixSafe(prefix: string): Promise<void> {
    try {
      await this.storage.deletePrefix(prefix);
    } catch (err) {
      this.logger.warn(`Failed to delete storage prefix ${prefix}: ${err}`);
    }
  }
}
