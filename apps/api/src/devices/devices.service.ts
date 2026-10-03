import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import {
  activateDeviceSchema,
  createCustomerSchema,
  createDeviceSchema,
  heartbeatSchema,
  issueActivationSchema,
  updateDeviceSchema,
  renewDeviceSchema,
  bulkDeviceSchema,
} from "@lc-play/contracts";
import type { AdminTokenPayload } from "../common/types";
import {
  hashPassword,
  decryptSecret,
  hmacIdentifier,
  normalizeActivationCode,
  randomActivationCode,
  randomDeviceSecret,
  sha256,
} from "../common/crypto";
import { parseBody } from "../common/parse";
import { PrismaService } from "../prisma/prisma.service";
import type { DevicePrincipal } from "./device-token.guard";
import type { CreatePlaylistInput } from "@lc-play/contracts";
import { encryptedPlaylistData } from "../playlists/playlist-data";
import { deviceRenewal } from "./device-renewal";

const deviceRelations = {
  customer: true,
  playlist: { select: { id: true, name: true, type: true, status: true } },
} as const;

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(admin: AdminTokenPayload) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId: admin.tenantId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        playlist: { select: { id: true, name: true, type: true, status: true } },
        activationCodes: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { codeHint: true, expiresAt: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return devices.map((device) => this.sanitizeDevice(device));
  }

  async create(admin: AdminTokenPayload, input: unknown) {
    const data = parseBody(createDeviceSchema, input);
    await this.assertRelations(admin.tenantId, data.customerId, data.playlistId);

    const parentalPinHash = data.parentalPin ? await hashPassword(data.parentalPin) : null;
    return this.prisma.$transaction(async (tx) => {
      const customer = data.customerId ? null : await tx.customer.create({ data: {
        tenantId: admin.tenantId, name: data.label,
        email: data.contact?.email || null, phone: data.contact?.phone || null,
      } });
      if (customer) await tx.auditLog.create({ data: {
        tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
        action: "customer.created", entityType: "Customer", entityId: customer.id,
        metadata: { name: customer.name, automatic: true },
      } });
      const playlistId = data.playlist
        ? await this.createInlinePlaylist(tx, admin, data.playlist)
        : data.playlistId;
      const device = await tx.device.create({
        data: {
          tenantId: admin.tenantId,
          customerId: data.customerId ?? customer!.id,
          playlistId,
          label: data.label,
          platform: data.platform,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          parentalPinHash,
        },
        include: deviceRelations,
      });

      await tx.auditLog.create({ data: {
        tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
        action: "device.created", entityType: "Device", entityId: device.id,
        metadata: { label: device.label, platform: device.platform },
      } });
      return this.sanitizeDevice(device);
    });
  }

  async update(admin: AdminTokenPayload, deviceId: string, input: unknown) {
    const data = parseBody(updateDeviceSchema, input);
    const current = await this.findOwnedDevice(admin.tenantId, deviceId);
    if (data.playlistId !== undefined) {
      await this.assertRelations(admin.tenantId, current.customerId, data.playlistId);
    }

    const parentalPinHash = data.parentalPin === undefined
      ? undefined : data.parentalPin ? await hashPassword(data.parentalPin) : null;
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.device.findUnique({ where: { id: deviceId }, select: { status: true, deviceTokenHash: true } });
      if (!latest) throw new NotFoundException("Dispositivo não encontrado.");
      const restoredStatus = latest.status === "EXPIRED" && data.expiresAt !== undefined &&
        (!data.expiresAt || new Date(data.expiresAt) > new Date())
        ? latest.deviceTokenHash ? "ACTIVE" : "PENDING" : undefined;
      if (data.contact) {
        await tx.customer.update({ where: { id: current.customerId }, data: {
          email: data.contact.email === undefined ? undefined : data.contact.email || null,
          phone: data.contact.phone === undefined ? undefined : data.contact.phone || null,
        } });
        await tx.auditLog.create({ data: {
          tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
          action: "customer.updated", entityType: "Customer", entityId: current.customerId,
          metadata: { fields: Object.keys(data.contact) },
        } });
      }
      const playlistId = data.playlist
        ? await this.createInlinePlaylist(tx, admin, data.playlist)
        : data.playlistId;
      const device = await tx.device.update({
        where: { id: deviceId },
        data: {
          label: data.label,
          playlistId,
          status: data.status ?? restoredStatus,
          expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ? new Date(data.expiresAt) : null,
          parentalPinHash,
        },
        include: deviceRelations,
      });

      await tx.auditLog.create({ data: {
        tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
        action: "device.updated", entityType: "Device", entityId: device.id,
        metadata: { fields: Object.keys(data) },
      } });
      return this.sanitizeDevice(device);
    }, { timeout: 15_000, isolationLevel: "Serializable" });
  }

  private async createInlinePlaylist(tx: Prisma.TransactionClient, admin: AdminTokenPayload, playlist: CreatePlaylistInput) {
    const source = await tx.playlist.create({
      data: encryptedPlaylistData(admin.tenantId, playlist, this.config.getOrThrow<string>("DATA_ENCRYPTION_KEY")),
      select: { id: true, name: true, type: true },
    });
    await tx.auditLog.create({ data: {
      tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
      action: "playlist.created", entityType: "Playlist", entityId: source.id,
      metadata: { name: source.name, type: source.type },
    } });
    return source.id;
  }

  async details(admin: AdminTokenPayload, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: admin.tenantId }, include: deviceRelations,
    });
    if (!device) throw new NotFoundException("Dispositivo não encontrado.");
    const history = await this.prisma.auditLog.findMany({
      where: { tenantId: admin.tenantId, OR: [
        { entityType: "Device", entityId: deviceId },
        { entityType: "Customer", entityId: device.customerId },
      ] },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, action: true, actorType: true, createdAt: true, entityType: true, entityId: true, metadata: true },
    });
    return { device: this.sanitizeDevice(device), history };
  }

  async renew(admin: AdminTokenPayload, deviceId: string, input: unknown) {
    const { days } = parseBody(renewDeviceSchema, input);
    return this.bulk(admin, { action: "RENEW", deviceIds: [deviceId], days });
  }

  async bulk(admin: AdminTokenPayload, input: unknown) {
    const data = parseBody(bulkDeviceSchema, input);
    const deviceIds = [...new Set(data.deviceIds)];
    return this.prisma.$transaction(async (tx) => {
      const devices = await tx.device.findMany({ where: { tenantId: admin.tenantId, id: { in: deviceIds } } });
      if (devices.length !== deviceIds.length) throw new BadRequestException("A seleção contém dispositivos inválidos. Nenhuma alteração foi aplicada.");
      if (data.action === "SOURCE") {
        const playlist = await tx.playlist.findFirst({ where: { tenantId: admin.tenantId, id: data.playlistId } });
        if (!playlist) throw new BadRequestException("Fonte inválida.");
      }
      const now = new Date();
      for (const device of devices) {
        const renewal = data.action === "RENEW" ? deviceRenewal(device, data.days, now) : null;
        const changes = renewal ?? (data.action === "SUSPEND" ? { status: "SUSPENDED" as const } : data.action === "SOURCE" ? { playlistId: data.playlistId } : {});
        await tx.device.update({ where: { id: device.id }, data: changes });
        await tx.auditLog.create({ data: {
          tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
          action: data.action === "RENEW" ? "device.renewed" : data.action === "SUSPEND" ? "device.suspended" : "device.source_changed",
          entityType: "Device", entityId: device.id,
          metadata: { label: device.label, batchSize: devices.length,
            ...(data.action === "RENEW" && renewal ? { days: data.days, previousExpiresAt: device.expiresAt?.toISOString() ?? null, expiresAt: renewal.expiresAt.toISOString() } : {}),
            ...(data.action === "SOURCE" ? { playlistId: data.playlistId, previousPlaylistId: device.playlistId } : {}),
          },
        } });
      }
      return { updated: devices.length };
    }, { timeout: 15_000, isolationLevel: "Serializable" });
  }

  async remove(admin: AdminTokenPayload, deviceId: string) {
    const device = await this.findOwnedDevice(admin.tenantId, deviceId);
    await this.prisma.$transaction([
      this.prisma.device.delete({ where: { id: device.id } }),
      this.prisma.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorType: "ADMIN",
          actorId: admin.sub,
          action: "device.deleted",
          entityType: "Device",
          entityId: device.id,
          metadata: { label: device.label },
        },
      }),
    ]);
    return { deleted: true };
  }

  async issueActivation(admin: AdminTokenPayload, deviceId: string, input: unknown) {
    const { ttlMinutes, purpose } = parseBody(issueActivationSchema, input ?? {});
    const device = await this.findOwnedDevice(admin.tenantId, deviceId);
    if (purpose === "LG_REVIEW") {
      if (admin.role !== "OWNER") throw new ForbiddenException("Somente o responsável pode preparar a revisão LG.");
      if (device.platform !== "LG_WEBOS" || device.status !== "PENDING" || device.platformIdentifierHmac || device.deviceTokenHash || !device.label.startsWith("LG QA - ")) {
        throw new BadRequestException("Use um dispositivo LG QA novo e separado dos clientes.");
      }
      const playlist = device.playlistId ? await this.prisma.playlist.findFirst({ where: { id: device.playlistId, tenantId: admin.tenantId } }) : null;
      if (!playlist || playlist.type !== "M3U" || playlist.status !== "ACTIVE" ||
          decryptSecret(playlist.sourceUrlEncrypted, this.config.getOrThrow<string>("DATA_ENCRYPTION_KEY")) !== "https://lcplay.thxtech.site/playlist.m3u") {
        throw new BadRequestException("A revisão LG exige a fonte técnica própria, sem conteúdo de clientes.");
      }
    }
    const code = randomActivationCode();
    const normalizedCode = normalizeActivationCode(code);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.prisma.$transaction([
      this.prisma.activationCode.updateMany({
        where: { deviceId, status: "PENDING" },
        data: { status: "REVOKED" },
      }),
      this.prisma.activationCode.create({
        data: {
          deviceId,
          codeHash: sha256(normalizedCode),
          codeHint: normalizedCode.slice(-4),
          expiresAt,
        },
      }),
      this.prisma.device.update({
        where: { id: deviceId },
        data: { status: "PENDING" },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorType: "ADMIN",
          actorId: admin.sub,
          action: "device.activation_issued",
          entityType: "Device",
          entityId: deviceId,
          metadata: { expiresAt: expiresAt.toISOString(), codeHint: normalizedCode.slice(-4), purpose },
        },
      }),
    ]);

    return { code, expiresAt: expiresAt.toISOString(), deviceLabel: device.label };
  }

  async unlink(admin: AdminTokenPayload, deviceId: string) {
    const device = await this.findOwnedDevice(admin.tenantId, deviceId);
    await this.prisma.$transaction([
      this.prisma.activationCode.updateMany({
        where: { deviceId, status: "PENDING" },
        data: { status: "REVOKED" },
      }),
      this.prisma.device.update({
        where: { id: deviceId },
        data: {
          status: "PENDING",
          platformIdentifierHmac: null,
          deviceTokenHash: null,
          activatedAt: null,
          lastSeenAt: null,
          model: null,
          osVersion: null,
          appVersion: null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorType: "ADMIN",
          actorId: admin.sub,
          action: "device.unlinked",
          entityType: "Device",
          entityId: deviceId,
          metadata: { label: device.label },
        },
      }),
    ]);
    return { unlinked: true };
  }

  async activate(input: unknown) {
    const data = parseBody(activateDeviceSchema, input);
    const normalizedCode = normalizeActivationCode(data.code);
    const activation = await this.prisma.activationCode.findUnique({
      where: { codeHash: sha256(normalizedCode) },
      include: { device: { include: { playlist: true } } },
    });

    if (!activation || activation.status !== "PENDING") {
      throw new BadRequestException("Chave de ativação inválida ou já utilizada.");
    }
    if (activation.expiresAt <= new Date()) {
      await this.prisma.activationCode.update({
        where: { id: activation.id },
        data: { status: "EXPIRED" },
      });
      throw new BadRequestException("A chave de ativação expirou.");
    }
    if (activation.device.platform !== data.platform) {
      throw new BadRequestException("A chave foi criada para outra plataforma.");
    }
    if (activation.device.expiresAt && activation.device.expiresAt <= new Date()) {
      throw new BadRequestException("A validade deste dispositivo expirou.");
    }

    const pepper = this.config.getOrThrow<string>("DEVICE_ID_PEPPER");
    const identifierHmac = hmacIdentifier(data.platform, data.platformDeviceId, pepper);
    const conflictingDevice = await this.prisma.device.findFirst({
      where: {
        platformIdentifierHmac: identifierHmac,
        id: { not: activation.deviceId },
      },
      select: { id: true },
    });
    if (conflictingDevice) {
      throw new ConflictException("Esta TV já está vinculada a outro dispositivo.");
    }

    const secret = randomDeviceSecret();
    const now = new Date();
    const updatedDevice = await this.prisma.$transaction(async (transaction) => {
      // Claim the one-use code atomically, including concurrent activation attempts.
      const claimed = await transaction.activationCode.updateMany({
        where: { id: activation.id, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "USED", usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException("Chave de ativação inválida, expirada ou já utilizada.");
      const result = await transaction.device.update({
        where: { id: activation.deviceId },
        data: {
          status: "ACTIVE",
          platformIdentifierHmac: identifierHmac,
          deviceTokenHash: sha256(secret),
          model: data.model,
          osVersion: data.osVersion,
          appVersion: data.appVersion,
          activatedAt: now,
          lastSeenAt: now,
        },
        include: { playlist: true },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: result.tenantId,
          actorType: "DEVICE",
          actorId: result.id,
          action: "device.activated",
          entityType: "Device",
          entityId: result.id,
          metadata: { platform: result.platform, model: result.model },
        },
      });
      return result;
    });

    return {
      deviceId: updatedDevice.id,
      deviceToken: `${updatedDevice.id}.${secret}`,
      displayName: updatedDevice.label,
      platform: updatedDevice.platform,
      expiresAt: updatedDevice.expiresAt?.toISOString() ?? null,
      configuration: {
        playlistAssigned: Boolean(updatedDevice.playlistId),
        parentalControlEnabled: Boolean(updatedDevice.parentalPinHash),
      },
    };
  }

  async heartbeat(device: DevicePrincipal, input: unknown) {
    const data = parseBody(heartbeatSchema, input ?? {});
    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        model: data.model,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
      },
      select: { status: true, expiresAt: true, playlistId: true, updatedAt: true },
    });
    return {
      ...updated,
      serverTime: new Date().toISOString(),
    };
  }

  getConfiguration(device: DevicePrincipal) {
    return {
      device: {
        id: device.id,
        label: device.label,
        status: device.status,
        expiresAt: device.expiresAt?.toISOString() ?? null,
      },
      playlist: device.playlist
        ? {
            id: device.playlist.id,
            name: device.playlist.name,
            type: device.playlist.type,
            status: device.playlist.status,
            itemCount: device.playlist.itemCount,
            lastSyncAt: device.playlist.lastSyncAt?.toISOString() ?? null,
          }
        : null,
      features: {
        live: true,
        movies: true,
        series: true,
        favorites: true,
        history: true,
      },
    };
  }

  listCustomers(admin: AdminTokenPayload) {
    return this.prisma.customer.findMany({
      where: { tenantId: admin.tenantId },
      include: { _count: { select: { devices: true } } },
      orderBy: { name: "asc" },
    });
  }

  async createCustomer(admin: AdminTokenPayload, input: unknown) {
    const data = parseBody(createCustomerSchema, input);
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: admin.tenantId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null,
      },
    });
    await this.audit(admin, "customer.created", "Customer", customer.id, { name: customer.name });
    return customer;
  }

  private async findOwnedDevice(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException("Dispositivo não encontrado.");
    return device;
  }

  private async assertRelations(tenantId: string, customerId?: string, playlistId?: string | null) {
    if (customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
      if (!customer) throw new BadRequestException("Cliente inválido.");
    }
    if (playlistId) {
      const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, tenantId } });
      if (!playlist) throw new BadRequestException("Fonte inválida.");
    }
  }

  private sanitizeDevice<
    T extends {
      platformIdentifierHmac?: string | null;
      deviceTokenHash?: string | null;
      parentalPinHash?: string | null;
    },
  >(device: T) {
    const safeDevice = { ...device };
    delete safeDevice.platformIdentifierHmac;
    delete safeDevice.deviceTokenHash;
    delete safeDevice.parentalPinHash;
    return safeDevice;
  }

  private audit(
    admin: AdminTokenPayload,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorType: "ADMIN",
        actorId: admin.sub,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }
}

