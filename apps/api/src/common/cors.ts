export function allowedWebOrigins(adminOrigin: string, playerOrigins = "") {
  return [...new Set([
    adminOrigin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...playerOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
  ])];
}
