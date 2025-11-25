import { env } from "../../env";
import { logger } from "../logger";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";

type UploadPayload = {
  buffer: Buffer;
  mimeType: string;
};

type UploadResult = {
  url: string;
  key: string;
};

export interface ObjectStorage {
  upload: (keyPrefix: string, payload: UploadPayload) => Promise<UploadResult>;
  delete: (key: string) => Promise<void>;
}

class LocalObjectStorage implements ObjectStorage {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(__dirname, "../../../uploads");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async upload(keyPrefix: string, payload: UploadPayload) {
    const key = `${keyPrefix}/${crypto.randomUUID()}`;
    const fullPath = path.resolve(this.baseDir, key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, payload.buffer);
    logger.info({ key }, "Stored media locally");
    const url = `${env.FILE_BASE_URL ?? ""}/uploads/${key}`;
    return { url, key };
  }

  async delete(key: string) {
    try {
      const fullPath = path.resolve(this.baseDir, key);
      await fs.promises.unlink(fullPath);
    } catch (err: any) {
      if (err && err.code === "ENOENT") return;
      throw err;
    }
  }
}

class S3CompatibleStorage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;
  private ready: Promise<void>;

  constructor() {
    this.client = new S3Client({
      region: "us-east-1",
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
      },
    });
    this.bucket = env.OBJECT_STORAGE_BUCKET;
    this.ready = this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      await this.applyPublicPolicy();
    } catch (err: any) {
      const statusCode = err?.$metadata?.httpStatusCode;
      if (statusCode === 404) {
        await this.client.send(
          new CreateBucketCommand({
            Bucket: this.bucket,
          })
        );
        logger.info({ bucket: this.bucket }, "Created object storage bucket");
        await this.applyPublicPolicy();
      } else if (statusCode === 409) {
        // bucket already exists in MinIO/S3, safe to proceed
        await this.applyPublicPolicy();
        return;
      } else {
        logger.error({ err }, "Failed to verify object storage bucket");
        throw err;
      }
    }
  }

  private async applyPublicPolicy() {
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };

    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy),
        })
      );
    } catch (err) {
      logger.warn({ err }, "Failed to apply public bucket policy");
    }
  }

  async upload(keyPrefix: string, payload: UploadPayload) {
    await this.ready;
    const key = `${keyPrefix}/${crypto.randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: payload.buffer,
        ContentType: payload.mimeType,
        ACL: "public-read",
      })
    );
    const base = env.OBJECT_STORAGE_ENDPOINT.replace(/\/$/, "");
    return { url: `${base}/${this.bucket}/${key}`, key };
  }

  async delete(key: string) {
    await this.ready;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

export const objectStorage =
  env.OBJECT_STORAGE_ENDPOINT && env.OBJECT_STORAGE_ENDPOINT.includes("http")
    ? new S3CompatibleStorage()
    : new LocalObjectStorage();
