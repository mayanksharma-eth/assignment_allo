import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function loadEnvironment() {
  const envCandidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "apps/api/.env"),
    resolve(__dirname, "../.env")
  ];

  for (const envFile of envCandidates) {
    if (existsSync(envFile)) {
      loadDotEnv({ path: envFile, override: false });
    }
  }
}

async function bootstrap() {
  loadEnvironment();

  const app = await NestFactory.create(AppModule, { cors: true });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}

bootstrap();
