import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminTokenPayload } from "../common/types";
import { CatalogService } from "../catalog/catalog.service";
import { CurrentDevice } from "./current-device.decorator";
import type { DevicePrincipal } from "./device-token.guard";
import { DeviceTokenGuard } from "./device-token.guard";
import { catalogKindSchema } from "@lc-play/contracts";
import { parseBody } from "../common/parse";
import { DevicesService } from "./devices.service";

@Controller("admin/devices")
@UseGuards(AdminAuthGuard)
export class AdminDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminTokenPayload) {
    return this.devices.list(admin);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminTokenPayload, @Body() body: unknown) {
    return this.devices.create(admin, body);
  }

  @Patch(":deviceId")
  update(
    @CurrentAdmin() admin: AdminTokenPayload,
    @Param("deviceId") deviceId: string,
    @Body() body: unknown,
  ) {
    return this.devices.update(admin, deviceId, body);
  }

  @Delete(":deviceId")
  remove(@CurrentAdmin() admin: AdminTokenPayload, @Param("deviceId") deviceId: string) {
    return this.devices.remove(admin, deviceId);
  }

  @Post(":deviceId/activation-code")
  issueActivation(
    @CurrentAdmin() admin: AdminTokenPayload,
    @Param("deviceId") deviceId: string,
    @Body() body: unknown,
  ) {
    return this.devices.issueActivation(admin, deviceId, body);
  }

  @Post(":deviceId/unlink")
  unlink(@CurrentAdmin() admin: AdminTokenPayload, @Param("deviceId") deviceId: string) {
    return this.devices.unlink(admin, deviceId);
  }
}

@Controller("admin/customers")
@UseGuards(AdminAuthGuard)
export class AdminCustomersController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminTokenPayload) {
    return this.devices.listCustomers(admin);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminTokenPayload, @Body() body: unknown) {
    return this.devices.createCustomer(admin, body);
  }
}

@Controller("v1/device")
export class TvDeviceController {
  constructor(
    private readonly devices: DevicesService,
    private readonly catalog: CatalogService,
  ) {}

  @Post("activate")
  activate(@Body() body: unknown) {
    return this.devices.activate(body);
  }

  @Post("heartbeat")
  @UseGuards(DeviceTokenGuard)
  heartbeat(@CurrentDevice() device: DevicePrincipal, @Body() body: unknown) {
    return this.devices.heartbeat(device, body);
  }

  @Get("configuration")
  @UseGuards(DeviceTokenGuard)
  configuration(@CurrentDevice() device: DevicePrincipal) {
    return this.devices.getConfiguration(device);
  }

  @Get("catalog")
  @UseGuards(DeviceTokenGuard)
  catalogForDevice(@CurrentDevice() device: DevicePrincipal, @Query("kind") kind?: string) {
    return this.catalog.forDevice(device, parseBody(catalogKindSchema.optional(), kind));
  }
}

