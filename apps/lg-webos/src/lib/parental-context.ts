import { createContext, useContext } from "react";

export type ParentalControl = { unlocked: boolean; authorize: (action: () => void) => void; lock: () => void; changePin: () => void };
export const ParentalContext = createContext<ParentalControl | null>(null);

export function useParentalControl() {
  const context = useContext(ParentalContext);
  if (!context) throw new Error("Parental control provider missing");
  return context;
}
