import { z } from "zod";

export const devicePlatformSchema = z.enum(["LG_WEBOS", "ROKU"]);
export const deviceStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
]);
export const playlistTypeSchema = z.enum(["M3U", "XTREAM"]);
export const playlistStatusSchema = z.enum(["ACTIVE", "PAUSED", "ERROR"]);

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const createPlaylistSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    type: playlistTypeSchema,
    sourceUrl: z.string().trim().url(),
    epgUrl: z.string().trim().url().optional().or(z.literal("")),
    username: z.string().trim().max(180).optional(),
    password: z.string().max(180).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "XTREAM" && (!value.username || !value.password)) {
      context.addIssue({
        code: "custom",
        message: "Usuário e senha são obrigatórios para fontes Xtream.",
        path: ["username"],
      });
    }
  });

export const updatePlaylistSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  type: playlistTypeSchema.optional(),
  status: playlistStatusSchema.optional(),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  epgUrl: z.string().trim().url().optional().or(z.literal("")),
  username: z.string().trim().max(180).optional(),
  password: z.string().max(180).optional(),
});

export const createDeviceSchema = z.object({
  label: z.string().trim().min(2).max(80),
  platform: devicePlatformSchema,
  customerId: z.string().trim().min(1),
  playlistId: z.string().trim().min(1).optional().nullable(),
  playlist: createPlaylistSchema.optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  parentalPin: z.string().regex(/^\d{4}$/).optional().nullable(),
}).superRefine((value, context) => {
  if (value.playlist && value.playlistId) {
    context.addIssue({ code: "custom", message: "Escolha uma fonte cadastrada ou cadastre uma nova fonte.", path: ["playlistId"] });
  }
});

export const updateDeviceSchema = z.object({
  label: z.string().trim().min(2).max(80).optional(),
  playlistId: z.string().trim().min(1).nullable().optional(),
  playlist: createPlaylistSchema.optional(),
  status: deviceStatusSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  parentalPin: z.string().regex(/^\d{4}$/).nullable().optional(),
}).superRefine((value, context) => {
  if (value.playlist && value.playlistId !== undefined) {
    context.addIssue({ code: "custom", message: "Escolha uma fonte cadastrada ou cadastre uma nova fonte.", path: ["playlistId"] });
  }
});

export const issueActivationSchema = z.object({
  ttlMinutes: z.number().int().min(5).max(1440).default(30),
});

export const activateDeviceSchema = z.object({
  code: z.string().trim().min(8).max(24),
  platform: devicePlatformSchema,
  platformDeviceId: z.string().trim().min(8).max(512),
  model: z.string().trim().max(100).optional(),
  osVersion: z.string().trim().max(60).optional(),
  appVersion: z.string().trim().max(30).optional(),
});

export const heartbeatSchema = z.object({
  model: z.string().trim().max(100).optional(),
  osVersion: z.string().trim().max(60).optional(),
  appVersion: z.string().trim().max(30).optional(),
});

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
export type PlaylistType = z.infer<typeof playlistTypeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type ActivateDeviceInput = z.infer<typeof activateDeviceSchema>;

export interface DeviceActivationResponse {
  deviceId: string;
  deviceToken: string;
  displayName: string;
  platform: DevicePlatform;
  expiresAt: string | null;
  configuration: {
    playlistAssigned: boolean;
    parentalControlEnabled: boolean;
  };
}

export const catalogKindSchema = z.enum(["LIVE", "MOVIE", "SERIES"]);
export type CatalogKind = z.infer<typeof catalogKindSchema>;

export interface EpgProgramme {
  title: string;
  description: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  group: string;
  logo: string | null;
  streamUrl: string;
  tvgId: string | null;
  series: {
    title: string;
    season: number;
    episode: number;
  } | null;
  now: EpgProgramme | null;
  next: EpgProgramme | null;
}

export interface DeviceCatalog {
  kind?: CatalogKind;
  source: {
    id: string;
    name: string;
    type: PlaylistType;
  };
  summary: {
    total: number;
    live: number;
    movies: number;
    series: number;
  };
  groups: Array<{ name: string; count: number }>;
  items: CatalogItem[];
  truncated: boolean;
  refreshedAt: string;
  epg: {
    status: "AVAILABLE" | "UNAVAILABLE" | "ERROR";
    programmes: number;
  };
}

export interface DashboardSummary {
  activeDevices: number;
  pendingDevices: number;
  suspendedDevices: number;
  playlists: number;
  customers: number;
  onlineNow: number;
}
