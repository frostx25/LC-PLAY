export const PARENTAL_PIN_KEY = "lc_play_parental_pin";

export function isAdultGroup(group: string) {
  const name = group.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\badult[oa]s?\b|\badults?\b|\bxxx\b|\+\s*18\b|\b18\s*\+|\bporn\w*\b|\berotic[oa]s?\b/.test(name);
}

export function validParentalPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

export function readParentalPin(storage: Pick<Storage, "getItem">) {
  try {
    const pin = storage.getItem(PARENTAL_PIN_KEY) ?? "";
    return validParentalPin(pin) ? pin : "0000";
  } catch { return "0000"; }
}
