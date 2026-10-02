import type { DeviceStatus } from "@prisma/client";

export function deviceRenewal(
  device: { expiresAt: Date | null; status: DeviceStatus; deviceTokenHash: string | null },
  days: 30 | 90 | 365,
  now = new Date(),
) {
  const base = Math.max(now.getTime(), device.expiresAt?.getTime() ?? 0);
  const expiresAt = new Date(base + days * 86_400_000);
  const status = device.status === "EXPIRED"
    ? device.deviceTokenHash ? "ACTIVE" as const : "PENDING" as const
    : device.status;
  return { expiresAt, status };
}
