type WebOsRequest = {
  method: string;
  parameters?: Record<string, unknown>;
  onSuccess: (response: unknown) => void;
  onFailure: (error: unknown) => void;
};

declare global {
  interface Window {
    PalmServiceBridge?: unknown;
    webOS?: {
      platform?: { tv?: boolean };
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
  const randomPart = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const value = `preview-lg-${randomPart}`;
  localStorage.setItem(PREVIEW_ID_KEY, value);
  return value;
}

export async function getLgDeviceIdentity(): Promise<{
  id: string;
  model?: string;
  osVersion?: string;
}> {
  if (!window.webOS?.platform?.tv && !window.PalmServiceBridge) {
    return { id: previewDeviceId(), model: "Navegador local", osVersion: "Preview" };
  }
  if (!window.webOS?.service?.request) {
    throw new Error("Biblioteca webOS indisponível. Reinstale o aplicativo na TV.");
  }

  const deviceInfo = await new Promise<Record<string, unknown>>((resolve) => {
    if (!window.webOS?.deviceInfo) return resolve({});
    const timeout = setTimeout(() => resolve({}), 5_000);
    window.webOS.deviceInfo((info) => {
      clearTimeout(timeout);
      resolve(info);
    });
  });

  const id = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      request?.cancel?.();
      reject(new Error("A TV não respondeu à identificação. Tente novamente."));
    }, 10_000);
    const request = window.webOS?.service?.request("luna://com.webos.service.sm", {
      method: "deviceid/getIDs",
      parameters: { idType: ["LGUDID"] },
      onSuccess: (response) => {
        clearTimeout(timeout);
        const result = response as { idList?: Array<{ idType: string; idValue: string }> };
        const lgudid = result.idList?.find((item) => item.idType === "LGUDID")?.idValue;
        if (lgudid) resolve(lgudid);
        else reject(new Error("LGUDID indisponível."));
      },
      onFailure: () => {
        clearTimeout(timeout);
        reject(new Error("Não foi possível obter a identidade da TV."));
      },
    });
  });

  return {
    id,
    model: typeof deviceInfo.modelName === "string" ? deviceInfo.modelName : undefined,
    osVersion:
      typeof deviceInfo.sdkVersion === "string"
        ? deviceInfo.sdkVersion
        : typeof deviceInfo.version === "string"
          ? deviceInfo.version
          : undefined,
  };
}

