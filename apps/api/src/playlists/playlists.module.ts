import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlaylistsController } from "./playlists.controller";
import { PlaylistsService } from "./playlists.service";
import { DevicesModule } from "../devices/devices.module";

@Module({
  imports: [AuthModule, DevicesModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
})
export class PlaylistsModule {}

