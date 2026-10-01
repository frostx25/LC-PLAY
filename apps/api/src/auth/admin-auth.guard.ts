import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { AdminTokenPayload } from "../common/types";

type AdminRequest = Request & { admin?: AdminTokenPayload };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) throw new UnauthorizedException("Sessão administrativa ausente.");

    try {
      request.admin = await this.jwtService.verifyAsync<AdminTokenPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException("Sessão administrativa inválida ou expirada.");
    }
  }
}

