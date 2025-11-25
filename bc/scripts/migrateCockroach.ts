import "dotenv/config";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";

const cockroachUrl = process.env.COCKROACH_URL;

if (!cockroachUrl) {
  console.error("COCKROACH_URL not set");
  process.exit(1);
}

const schemaPath = process.env.PRISMA_SCHEMA ?? join(process.cwd(), "prisma", "schema.prisma");
const schemaDir = dirname(schemaPath);
const schemaContents = readFileSync(schemaPath, "utf8");

const cockroachSchema = schemaContents.replace(
  /provider\s*=\s*"postgresql"/,
  'provider = "cockroachdb"'
);

const tempDir = mkdtempSync(join(tmpdir(), "prisma-cockroach-"));
const tempSchemaPath = join(tempDir, "schema.prisma");
writeFileSync(tempSchemaPath, cockroachSchema);

const migrationsSrc = join(schemaDir, "migrations");
const migrationsDest = join(tempDir, "migrations");
cpSync(migrationsSrc, migrationsDest, { recursive: true });
const migrationLockPath = join(migrationsDest, "migration_lock.toml");
try {
  const lockContent = readFileSync(migrationLockPath, "utf8");
  const updatedLock = lockContent.replace(
    /provider\s*=\s*"postgresql"/,
    'provider = "cockroachdb"'
  );
  writeFileSync(migrationLockPath, updatedLock, "utf8");
} catch (err) {
  console.warn("Failed to rewrite migration_lock.toml", err);
}

const prismaBin = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);

const child = spawn(prismaBin, ["migrate", "deploy", "--schema", tempSchemaPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: cockroachUrl,
  },
});

child.on("exit", (code) => {
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
