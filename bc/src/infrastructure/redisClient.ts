import Redis from "ioredis";
import { env } from "../env";
import { logger } from "./logger";

class RedisSingleton {
  private static instance: Redis;

  static getInstance() {
    if (!RedisSingleton.instance) {
      RedisSingleton.instance = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        reconnectOnError: () => true,
      });

      RedisSingleton.instance.on("error", (err) => {
        logger.error({ err }, "Redis error");
      });

      RedisSingleton.instance.on("connect", () => {
        logger.info("Connected to Redis");
      });
    }

    return RedisSingleton.instance;
  }
}

export const redis = RedisSingleton.getInstance();
