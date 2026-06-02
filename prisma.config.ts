import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Create a .env file from .env.example");
}

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "apps/api/prisma/schema.prisma",
  migrations: {
    path: "apps/api/prisma/migrations",
    seed: "tsx apps/api/prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
