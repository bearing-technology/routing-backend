import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Redis } from "src/config/redis";

@Injectable()
export class RedisService {
  logger = new Logger();

  constructor() {}

  getTokensUrl(page: number) {
    return (
      "https://api-v2.sunpump.meme/pump-api/token/search?size=50&sort=tokenCreatedInstant:DESC&page=" +
      page
    );
  }

  async getUserFromRedis(userId: number): Promise<any> {
    const user = await Redis.get(userId.toString());

    /*if (!user) {
      const userData = await this.userService.getUserByTelegramId(userId);

      const cachedUser: ICachedUserData = {
        lastInteraction: UserInteraction.Start,
        lastTextMessage: "",
        userId,
      };

      await Redis.set(userId.toString(), JSON.stringify(cachedUser));

      return cachedUser;
    }

    return JSON.parse(user);*/
  }

  async updateUserInRedis(userId: number, data: any) {
    const user = await this.getUserFromRedis(userId);

    const updatedUser = { ...user, ...data };

    await Redis.set(userId.toString(), JSON.stringify(updatedUser));

    return updatedUser;
  }

  async startTokenLookup() {
    let responseData = [];
    let page = 0;

    let total: number | undefined;

    let totalFetched = 0;
    do {
      try {
        const { data } = await axios.get(this.getTokensUrl(page));
        if (data.data.tokens.length === 0) {
          this.logger.log(`Fetched total ${totalFetched} tokens.`);
          break;
        }

        await Promise.all(
          data.data.tokens.map(async (t) => {
            await Redis.set(t.contractAddress, JSON.stringify(t));
          })
        );
        totalFetched += data.data.tokens.length;

        this.logger.log(`Inserted ${totalFetched} in redis`);

        if (!total) {
          total = data.data.metadata.total;
          await Redis.set("TOKEN_STATS", total.toString());
        }

        page += 1;
        responseData = data.data.tokens;
      } catch (error) {
        this.logger.error(`Failed: ${error.message}`);
        break;
      }
    } while (responseData.length > 0);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async indexNewTokens() {
    try {
      const url = this.getTokensUrl(1);

      const { data } = await axios.get(url);

      const indexedTokens = await Redis.get("TOKEN_STATS");

      if (!indexedTokens) return;

      let parsedTokensAmount = parseInt(indexedTokens);
      const total = data.data.metadata.total;

      this.logger.log(`Current tokens amount ${total}`);

      if (data.data.metadata.total <= parsedTokensAmount) {
        this.logger.log(
          `No new tokens created! Metadata response: ${data.data.metadata.total}, our state: ${indexedTokens}`
        );
        return;
      }

      this.logger.warn(
        `Found ${total - parsedTokensAmount} newly created tokens!`
      );

      let page = 0;
      while (parsedTokensAmount < total) {
        const response = await axios.get(this.getTokensUrl(page));

        parsedTokensAmount += response.data.data.tokens.length;

        await Promise.all(
          response.data.data.tokens.map(async (t) => {
            await Redis.set(t.contractAddress, JSON.stringify(t));
          })
        );
        page++;
      }

      this.logger.log(
        `Inserted new  ${parsedTokensAmount - parseInt(indexedTokens)} tokens!`
      );
    } catch (error) {
      this.logger.error(`Cron failure: ${error.message}`);
    }
  }
}
