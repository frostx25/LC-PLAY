import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminTokenPayload } from "../common/types";
import { PlaylistsService } from "./playlists.service";

@Controller("admin/playlists")
@UseGuards(AdminAuthGuard)
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminTokenPayload) {
    return this.playlists.list(admin);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminTokenPayload, @Body() body: unknown) {
    return this.playlists.create(admin, body);
  }

  @Patch(":playlistId")
  update(
    @CurrentAdmin() admin: AdminTokenPayload,
    @Param("playlistId") playlistId: string,
    @Body() body: unknown,
  ) {
    return this.playlists.update(admin, playlistId, body);
  }

  @Delete(":playlistId")
  remove(@CurrentAdmin() admin: AdminTokenPayload, @Param("playlistId") playlistId: string) {
    return this.playlists.remove(admin, playlistId);
  }
}

