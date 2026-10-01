import type { CreatePlaylistInput } from "@lc-play/contracts";
import { encryptSecret } from "../common/crypto";

export function encryptedPlaylistData(tenantId: string, data: CreatePlaylistInput, encryptionKey: string) {
  return {
    tenantId,
    name: data.name,
    type: data.type,
    sourceUrlEncrypted: encryptSecret(data.sourceUrl, encryptionKey),
    epgUrlEncrypted: data.epgUrl ? encryptSecret(data.epgUrl, encryptionKey) : null,
    usernameEncrypted: data.username ? encryptSecret(data.username, encryptionKey) : null,
    passwordEncrypted: data.password ? encryptSecret(data.password, encryptionKey) : null,
  };
}
