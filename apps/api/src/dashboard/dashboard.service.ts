import { Injectable } from "@nestjs/common";
import type { AdminTokenPayload } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(admin: AdminTokenPayload) {
    const onlineThreshold = new Date(Date.now() - 5 * 60_000);
    const [activeDevices, pendingDevices, suspendedDevices, playlists, customers, onlineNow] =
      await this.prisma.$transaction([
        this.prisma.device.count({ where: { tenantId: admin.tenantId, status: "ACTIVE" } }),
        this.prisma.device.count({ where: { tenantId: admin.tenantId, status: "PENDING" } }),
        this.prisma.device.count({ where: { tenantId: admin.tenantId, status: "SUSPENDED" } }),
        this.prisma.playlist.count({ where: { tenantId: admin.tenantId } }),
        this.prisma.customer.count({ where: { tenantId: admin.tenantId } }),
        this.prisma.device.count({
          where: {
            tenantId: admin.tenantId,
            status: "ACTIVE",
            lastSeenAt: { gte: onlineThreshold },
          },
        }),
      ]);

    return { activeDevices, pendingDevices, suspendedDevices, playlists, customers, onlineNow };
  }

  logs(admin: AdminTokenPayload) {
    return this.prisma.auditLog.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}

