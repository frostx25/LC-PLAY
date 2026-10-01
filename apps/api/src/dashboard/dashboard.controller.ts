import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminTokenPayload } from "../common/types";
import { DashboardService } from "./dashboard.service";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("dashboard")
  summary(@CurrentAdmin() admin: AdminTokenPayload) {
    return this.dashboard.summary(admin);
  }

  @Get("audit-logs")
  logs(@CurrentAdmin() admin: AdminTokenPayload) {
    return this.dashboard.logs(admin);
  }
}

