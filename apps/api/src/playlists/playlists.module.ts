import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlaylistsController } from "./playlists.controller";
import { PlaylistsService } from "./playlists.service";

@Module({
  imports: [AuthModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
})
export class PlaylistsModule {}

