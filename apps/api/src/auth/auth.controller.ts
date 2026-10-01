import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { CurrentAdmin } from "./current-admin.decorator";
import type { AdminTokenPayload } from "../common/types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminTokenPayload) {
    return admin;
  }
}

