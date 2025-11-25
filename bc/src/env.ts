import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  READ_REPLICA_URL: z.string().optional(),
  COCKROACH_URL: z.string().optional(),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  CLIENT_ORIGIN: z.string().optional(),
  FILE_BASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  KAFKA_BROKERS: z.string().default("localhost:29092"),
  OBJECT_STORAGE_ENDPOINT: z.string().default("http://localhost:9000"),
  OBJECT_STORAGE_BUCKET: z.string().default("bits-social"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().default("minio"),
  OBJECT_STORAGE_SECRET_KEY: z.string().default("minio123"),
  TELEMETRY_ENDPOINT: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(300),
  RATE_LIMIT_WRITE_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_WRITE_MAX_REQUESTS: z.coerce.number().default(50),
});

export const env = envSchema.parse(process.env);
