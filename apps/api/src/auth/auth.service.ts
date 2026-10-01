import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { loginSchema } from "@lc-play/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { verifyPassword } from "../common/crypto";
import { parseBody } from "../common/parse";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: unknown) {
    const credentials = parseBody(loginSchema, input);
    const email = credentials.email.toLowerCase();
    const user = await this.prisma.adminUser.findFirst({
      where: { email, active: true },
      include: { tenant: true },
    });

    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      throw new UnauthorizedException("E-mail ou senha inválidos.");
    }

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant: user.tenant.name,
      },
    };
  }
}

