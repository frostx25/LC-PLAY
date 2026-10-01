import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AdminTokenPayload } from "../common/types";

type AdminRequest = Request & { admin?: AdminTokenPayload };

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminTokenPayload => {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (!request.admin) throw new Error("Administrador não encontrado no contexto.");
    return request.admin;
  },
);

