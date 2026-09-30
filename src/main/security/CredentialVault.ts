import { Buffer } from 'node:buffer';
import { z } from 'zod';
export const tokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  scopes: z.array(z.string()),
  clientId: z.string().min(1),
  platform: z.enum(['twitch', 'youtube']),
});
export type Tokens = z.infer<typeof tokenSchema>;
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export interface CredentialRepository {
  read(id: string): Promise<string | undefined>;
  write(id: string, payload?: string): Promise<void>;
}
export class CredentialVault {
  constructor(
    private cipher: Cipher,
    private repository: CredentialRepository,
  ) {}
  async get(id: string): Promise<Tokens | undefined> {
    const value = await this.repository.read(id);
    if (!value) return;
    this.check();
    try {
      return tokenSchema.parse(JSON.parse(this.cipher.decryptString(Buffer.from(value, 'base64'))));
    } catch {
      throw new Error(
        'Не удалось расшифровать сессию. Войдите в аккаунт заново в текущем профиле Windows.',
      );
    }
  }
  async set(id: string, value: Tokens) {
    this.check();
    await this.repository.write(
      id,
      this.cipher.encryptString(JSON.stringify(tokenSchema.parse(value))).toString('base64'),
    );
  }
  async remove(id: string) {
    await this.repository.write(id);
  }
  private check() {
    if (!this.cipher.isEncryptionAvailable())
      throw new Error('Защищённое хранилище Windows недоступно. Сохранение токенов запрещено.');
  }
}
