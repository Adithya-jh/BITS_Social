import multer from "multer";
import { objectStorage } from "../infrastructure/storage/objectStorage";
import { logger } from "../infrastructure/logger";

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export async function persistFile(buffer: Buffer, mimeType: string) {
  return objectStorage.upload("posts", { buffer, mimeType });
}

export async function deleteStoredFile(key?: string | null) {
  if (!key) return;
  try {
    await objectStorage.delete(key);
  } catch (err) {
    logger.warn({ err, key }, "Failed to delete stored media");
  }
}
