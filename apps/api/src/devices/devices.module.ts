import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogService } from "../catalog/catalog.service";
import {
  AdminCustomersController,
  AdminDevicesController,
  TvDeviceController,
} from "./devices.controller";
import { DevicesService } from "./devices.service";
import { DeviceTokenGuard } from "./device-token.guard";

@Module({
  imports: [AuthModule],
  controllers: [AdminDevicesController, AdminCustomersController, TvDeviceController],
  providers: [DevicesService, DeviceTokenGuard, CatalogService],
})
export class DevicesModule {}
