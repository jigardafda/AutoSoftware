import { encrypt, decrypt } from "@autosoftware/shared";
import { config } from "../../config.js";
import { prisma } from "../../db.js";

const secret = () => config.apiKeyEncryptionSecret;

export function encryptToken(token: string): string {
  return encrypt(token, secret());
}

export function decryptToken(encrypted: string): string {
  return decrypt(encrypted, secret());
}

export async function getValidAccessToken(integrationId: string): Promise<{
  accessToken: string;
  integration: any;
}> {
  const integration = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
  });

  if (integration.status === "expired") {
    throw new Error("Integration token has expired. Please reconnect.");
  }

  const accessToken = decryptToken(integration.encryptedAccessToken);
  return { accessToken, integration };
}
