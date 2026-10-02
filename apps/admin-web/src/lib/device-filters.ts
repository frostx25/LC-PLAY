export type DeviceFilters = { query: string; customerId: string; platform: string; status: string; validity: string };
export const emptyDeviceFilters: DeviceFilters = { query: "", customerId: "", platform: "", status: "", validity: "" };
type FilterDevice = {
  label: string; platform: string; status: string; expiresAt: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null };
};
export function effectiveStatus(device: Pick<FilterDevice, "status" | "expiresAt">, now = Date.now()) {
  return device.status !== "SUSPENDED" && device.expiresAt && new Date(device.expiresAt).getTime() <= now ? "EXPIRED" : device.status;
}
export function matchesDevice(device: FilterDevice, filter: DeviceFilters, now = Date.now()) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (filter.query && !normalize([device.label, device.customer.name, device.customer.email, device.customer.phone].join(" ")).includes(normalize(filter.query.trim()))) return false;
  if (filter.customerId && device.customer.id !== filter.customerId) return false;
  if (filter.platform && device.platform !== filter.platform) return false;
  if (filter.status && effectiveStatus(device, now) !== filter.status) return false;
  if (!filter.validity) return true;
  if (filter.validity === "unlimited") return !device.expiresAt;
  if (!device.expiresAt) return false;
  const delta = new Date(device.expiresAt).getTime() - now;
  if (filter.validity === "expired") return delta <= 0;
  return delta > 0 && delta <= Number(filter.validity) * 86_400_000;
}
