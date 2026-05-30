import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private key!: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const keyHex = this.configService.get<string>('ENCRYPTION_KEY');
    const expectedHexLength = this.keyLength * 2;
    if (!keyHex || keyHex.length !== expectedHexLength) {
      throw new Error(
        `ENCRYPTION_KEY must be ${expectedHexLength} hex characters (${this.keyLength} bytes)`,
      );
    }
    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error('ENCRYPTION_KEY must be a valid hex string');
    }
    if (/^0+$/.test(keyHex)) {
      throw new Error(
        'ENCRYPTION_KEY is set to the example value (all zeros); generate one with `openssl rand -hex 32`',
      );
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:encrypted:authTag (all hex)
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  }

  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
