import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { DevicePrincipal } from "./device-token.guard";

type DeviceRequest = Request & { device?: DevicePrincipal };

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DevicePrincipal => {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    if (!request.device) throw new Error("Dispositivo não encontrado no contexto.");
    return request.device;
  },
);

