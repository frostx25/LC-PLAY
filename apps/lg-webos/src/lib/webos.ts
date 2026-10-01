type WebOsRequest = {
  method: string;
  parameters?: Record<string, unknown>;
  onSuccess: (response: unknown) => void;
  onFailure: (error: unknown) => void;
};

declare global {
  interface Window {
    webOS?: {
      service?: {
        request: (uri: string, options: WebOsRequest) => { cancel?: () => void };
      };
      deviceInfo?: (callback: (info: Record<string, unknown>) => void) => void;
    };
  }
}

const PREVIEW_ID_KEY = "lc_play_preview_device_id";

function previewDeviceId() {
  const existing = localStorage.getItem(PREVIEW_ID_KEY);
  if (existing) return existing;
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const value = `preview-lg-${randomPart}`;
  localStorage.setItem(PREVIEW_ID_KEY, value);
  return value;
}

export async function getLgDeviceIdentity(): Promise<{
  id: string;
  model?: string;
  osVersion?: string;
}> {
  if (!window.webOS?.service?.request) {
    return { id: previewDeviceId(), model: "Navegador local", osVersion: "Preview" };
  }

  const deviceInfo = await new Promise<Record<string, unknown>>((resolve) => {
    if (!window.webOS?.deviceInfo) return resolve({});
    window.webOS.deviceInfo((info) => resolve(info));
  });

  const id = await new Promise<string>((resolve, reject) => {
    window.webOS?.service?.request("luna://com.webos.service.sm", {
      method: "deviceid/getIDs",
      parameters: { idType: ["LGUDID"] },
      onSuccess: (response) => {
        const result = response as { idList?: Array<{ idType: string; idValue: string }> };
        const lgudid = result.idList?.find((item) => item.idType === "LGUDID")?.idValue;
        if (lgudid) resolve(lgudid);
        else reject(new Error("LGUDID indisponível."));
      },
      onFailure: () => reject(new Error("Não foi possível obter a identidade da TV.")),
    });
  });

  return {
    id,
    model: typeof deviceInfo.modelName === "string" ? deviceInfo.modelName : undefined,
    osVersion:
      typeof deviceInfo.version === "string"
        ? deviceInfo.version
        : typeof deviceInfo.sdkVersion === "string"
          ? deviceInfo.sdkVersion
          : undefined,
  };
}

