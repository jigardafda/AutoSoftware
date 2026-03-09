import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config.js";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prismaModule = await import("../../generated/prisma/client.ts");
export const prisma = new prismaModule.PrismaClient({ adapter });
