import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { allowedWebOrigins } from "./common/cors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 4100);
  const adminOrigin = config.get<string>("ADMIN_WEB_URL", "http://localhost:3000");

  app.setGlobalPrefix("api");
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.enableCors({
    origin: allowedWebOrigins(adminOrigin, config.get<string>("PLAYER_WEB_ORIGINS", "")),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Token"],
  });
  app.enableShutdownHooks();

  await app.listen(port, "0.0.0.0");
  console.log(`LC PLAY API disponível em http://localhost:${port}/api`);
}

void bootstrap();
