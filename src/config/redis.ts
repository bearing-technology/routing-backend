import { Logger } from "@nestjs/common";
import { Redis as IoRedis } from "ioredis";
import { config } from "dotenv";

config();
export class RedisClient {
  private redis: IoRedis;
  private static client: RedisClient;

  logger = new Logger();

  private constructor() {
    this.redis = new IoRedis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    });
  }

  get client() {
    return this.redis;
  }
  static getInstance() {
    if (!RedisClient.client) {
      RedisClient.client = new RedisClient();
    }

    return RedisClient.client;
  }
}

export const Redis = RedisClient.getInstance().client;
