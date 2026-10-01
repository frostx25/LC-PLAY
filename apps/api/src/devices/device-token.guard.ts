import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Device, Playlist } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { safeEqual, sha256 } from "../common/crypto";

export type DevicePrincipal = Device & { playlist: Playlist | null };
type DeviceRequest = Request & { device?: DevicePrincipal };

@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : typeof request.headers["x-device-token"] === "string"
        ? request.headers["x-device-token"]
        : null;

    if (!token) throw new UnauthorizedException("Credencial do dispositivo ausente.");

    const separator = token.indexOf(".");
    if (separator < 1) throw new UnauthorizedException("Credencial do dispositivo inválida.");

    const deviceId = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { playlist: true },
    });

    if (!device?.deviceTokenHash || !safeEqual(device.deviceTokenHash, sha256(secret))) {
      throw new UnauthorizedException("Credencial do dispositivo inválida.");
    }

    if (device.status !== "ACTIVE") {
      throw new UnauthorizedException("Dispositivo inativo.");
    }

    if (device.expiresAt && device.expiresAt <= new Date()) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { status: "EXPIRED" },
      });
      throw new UnauthorizedException("Acesso do dispositivo expirado.");
    }

    request.device = device;
    return true;
  }
}

