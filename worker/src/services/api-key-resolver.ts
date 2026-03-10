import { prisma } from "../db.js";
import { config } from "../config.js";
import { decrypt } from "@autosoftware/shared";

export async function resolveApiKey(userId: string): Promise<{ key: string; apiKeyId: string | null }> {
  if (config.apiKeyEncryptionSecret) {
    const dbKey = await prisma.apiKey.findFirst({
      where: { userId, isActive: true },
      orderBy: { priority: "asc" },
    });
    if (dbKey) {
      try {
        const plainKey = decrypt(dbKey.encryptedKey, config.apiKeyEncryptionSecret);
        return { key: plainKey, apiKeyId: dbKey.id };
      } catch {
        // Decryption failed, fall through
      }
    }
  }
  return { key: config.anthropicApiKey, apiKeyId: null };
}
