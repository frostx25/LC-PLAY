import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPlaylistSchema, updatePlaylistSchema } from "@lc-play/contracts";
import { encryptSecret } from "../common/crypto";
import { parseBody } from "../common/parse";
import type { AdminTokenPayload } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { encryptedPlaylistData } from "./playlist-data";
import { CatalogService } from "../catalog/catalog.service";

@Injectable()
export class PlaylistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly catalog: CatalogService,
  ) {}

  list(admin: AdminTokenPayload) {
    return this.prisma.playlist.findMany({
      where: { tenantId: admin.tenantId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        itemCount: true,
        lastSyncAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { devices: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async diagnose(admin: AdminTokenPayload, playlistId: string) {
    const playlist = await this.findOwned(admin.tenantId, playlistId);
    const result = await this.catalog.diagnose(playlist);
    const lastError = [result.m3u, result.epg].filter((check) => check.status === "ERROR").map((check) => check.message).join(" ") || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.playlist.updateMany({
        where: { id: playlist.id, tenantId: admin.tenantId, updatedAt: playlist.updatedAt },
        data: {
          lastError,
          ...(playlist.type === "M3U" && playlist.status !== "PAUSED" ? { status: result.m3u.status === "OK" ? "ACTIVE" : "ERROR" } : {}),
          ...(result.m3u.status === "OK" ? { itemCount: result.m3u.count, lastSyncAt: new Date(result.checkedAt) } : {}),
        },
      });
      await tx.auditLog.create({ data: {
        tenantId: admin.tenantId, actorType: "ADMIN", actorId: admin.sub,
        action: "playlist.diagnosed", entityType: "Playlist", entityId: playlist.id,
        metadata: { name: playlist.name, checkedAt: result.checkedAt, durationMs: result.durationMs, m3u: { ...result.m3u }, epg: { ...result.epg } },
      } });
    });
    return result;
  }

  async latestDiagnostic(admin: AdminTokenPayload, playlistId: string) {
    await this.findOwned(admin.tenantId, playlistId);
    const log = await this.prisma.auditLog.findFirst({
      where: { tenantId: admin.tenantId, entityType: "Playlist", entityId: playlistId, action: "playlist.diagnosed" },
      orderBy: { createdAt: "desc" }, select: { metadata: true },
    });
    return log?.metadata ?? null;
  }

  async create(admin: AdminTokenPayload, input: unknown) {
    const data = parseBody(createPlaylistSchema, input);
    const encryptionKey = this.config.getOrThrow<string>("DATA_ENCRYPTION_KEY");
    const playlist = await this.prisma.playlist.create({
      data: encryptedPlaylistData(admin.tenantId, data, encryptionKey),
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        itemCount: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorType: "ADMIN",
        actorId: admin.sub,
        action: "playlist.created",
        entityType: "Playlist",
        entityId: playlist.id,
        metadata: { name: playlist.name, type: playlist.type },
      },
    });
    return playlist;
  }

  async update(admin: AdminTokenPayload, playlistId: string, input: unknown) {
    const data = parseBody(updatePlaylistSchema, input);
    const current = await this.findOwned(admin.tenantId, playlistId);
    const encryptionKey = this.config.getOrThrow<string>("DATA_ENCRYPTION_KEY");
    const updateData = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.sourceUrl ? { sourceUrlEncrypted: encryptSecret(data.sourceUrl, encryptionKey) } : {}),
      ...(data.epgUrl ? { epgUrlEncrypted: encryptSecret(data.epgUrl, encryptionKey) } : {}),
      ...(data.username ? { usernameEncrypted: encryptSecret(data.username, encryptionKey) } : {}),
      ...(data.password ? { passwordEncrypted: encryptSecret(data.password, encryptionKey) } : {}),
    };
    const nextType = data.type ?? current.type;
    const hasUsername = Boolean(data.username || current.usernameEncrypted);
    const hasPassword = Boolean(data.password || current.passwordEncrypted);
    if (nextType === "XTREAM" && (!hasUsername || !hasPassword)) {
      throw new BadRequestException("Usuário e senha são obrigatórios para fontes Xtream.");
    }
    const playlist = await this.prisma.playlist.update({
      where: { id: playlistId },
      data: updateData,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        itemCount: true,
        lastSyncAt: true,
        updatedAt: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorType: "ADMIN",
        actorId: admin.sub,
        action: "playlist.updated",
        entityType: "Playlist",
        entityId: playlist.id,
        metadata: { fields: Object.keys(updateData) },
      },
    });
    return playlist;
  }

  async remove(admin: AdminTokenPayload, playlistId: string) {
    const playlist = await this.findOwned(admin.tenantId, playlistId);
    const deviceCount = await this.prisma.device.count({ where: { playlistId } });
    if (deviceCount > 0) {
      throw new BadRequestException("Desvincule esta fonte dos dispositivos antes de excluí-la.");
    }

    await this.prisma.$transaction([
      this.prisma.playlist.delete({ where: { id: playlistId } }),
      this.prisma.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorType: "ADMIN",
          actorId: admin.sub,
          action: "playlist.deleted",
          entityType: "Playlist",
          entityId: playlistId,
          metadata: { name: playlist.name },
        },
      }),
    ]);
    return { deleted: true };
  }

  private async findOwned(tenantId: string, playlistId: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, tenantId },
    });
    if (!playlist) throw new NotFoundException("Fonte não encontrada.");
    return playlist;
  }
}

