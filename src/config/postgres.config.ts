import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { Pool } from "pg";

export const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "maglev.proxy.rlwy.net",
  database: process.env.DB_NAME || "railway",
  password: process.env.DB_PASSWORD || "tcTIfylDwwYptfEFUCMbuPgqssJiWjMp",
  port: process.env.DB_PORT || 39983,
});
