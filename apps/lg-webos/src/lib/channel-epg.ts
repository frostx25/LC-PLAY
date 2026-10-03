import type { CatalogItem, ChannelEpg, DeviceEpgSource } from "@lc-play/contracts";
import { request } from "./device-api.ts";

export function liveStreamId(streamUrl: string): string | null {
  try {
    const segments = new URL(streamUrl).pathname.split("/");
    const segment = segments[segments.length - 1] ?? "";
    return /^(\d{1,12})(?:\.(?:m3u8|ts))?$/i.exec(segment)?.[1] ?? null;
  } catch { return null; }
}

export function nativeGuideSupported() {
  return Boolean((window.webOS?.platform?.tv || window.PalmServiceBridge) && window.webOS?.service?.request);
}

export async function loadChannelEpg(sourceId: string, item: CatalogItem, token: string, signal: AbortSignal, catalogId?: string): Promise<ChannelEpg | null> {
  const streamId = liveStreamId(item.streamUrl);
  if ((!streamId && !catalogId) || !nativeGuideSupported()) return null;
  const source = await request<DeviceEpgSource>("v1/device/epg/source", { signal }, token, undefined, 15_000);
  if (source.sourceId !== sourceId || (!source.providerApiUrl && !catalogId) || signal.aborted) return null;
  return new Promise((resolve, reject) => {
    let nativeRequest: { cancel?: () => void } | undefined;
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      nativeRequest?.cancel?.();
      reject(error);
    };
    const abort = () => fail(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => fail(new Error("O EPG demorou para responder.")), 55_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    try { nativeRequest = window.webOS!.service!.request("luna://com.lcplay.tv.guide", {
      method: "loadGuide",
      parameters: { ...source, catalogId, streamId, channelName: item.name, tvgId: item.tvgId },
      onSuccess: (response) => {
        if (settled) return;
        settled = true;
        cleanup();
        const result = response as ChannelEpg;
        resolve(result && Array.isArray(result.programmes) ? result : null);
      },
      onFailure: () => fail(new Error("Não foi possível consultar a programação deste canal.")),
    });
    } catch { fail(new Error("Não foi possível iniciar a consulta do EPG.")); }
  });
}
