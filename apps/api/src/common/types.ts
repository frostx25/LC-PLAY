import type { AdminRole } from "@prisma/client";

export interface AdminTokenPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: AdminRole;
}

