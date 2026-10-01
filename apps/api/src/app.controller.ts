import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return {
      name: "LC PLAY API",
      status: "ok",
      time: new Date().toISOString(),
    };
  }
}

