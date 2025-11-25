import { PrismaClient } from "@prisma/client";
import { env } from "./env";
import { logger } from "./infrastructure/logger";

const createClient = (url: string, label: string) => {
  const client = new PrismaClient({
    datasourceUrl: url,
    log: ["error", "warn"],
  });

  if (!process.listeners("beforeExit").some((listener: any) => listener.name === `logPrismaExit${label}`)) {
    const handler = () => {
      logger.info({ label }, "Prisma client shutting down");
    };
    Object.defineProperty(handler, "name", { value: `logPrismaExit${label}` });
    process.once("beforeExit", handler);
  }

  return client;
};

const hasValue = (value?: string | null) =>
  typeof value === "string" && value.trim().length > 0;

const postgresClient = createClient(env.DATABASE_URL, "postgres");

const cockroachClient = hasValue(env.COCKROACH_URL)
  ? createClient(env.COCKROACH_URL!, "cockroach")
  : undefined;

const replicaClient = hasValue(env.READ_REPLICA_URL)
  ? createClient(env.READ_REPLICA_URL!, "replica")
  : undefined;

const primaryClient = cockroachClient ?? postgresClient;

export const prisma = primaryClient;
export const readReplica = replicaClient ?? primaryClient;
export const postgresFallback = postgresClient;
export const activeCockroachClient = cockroachClient;
