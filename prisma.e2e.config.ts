import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "apps/api/prisma/schema.prisma",
  migrations: { path: "apps/api/prisma/migrations" },
  datasource: { url: "postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable" },
});
