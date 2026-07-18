import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Allow only safe navigable URLs in rendered links. Blocks javascript:,
 * data: (except images already handled separately), vbscript:, and bare
 * relative schemes that could escape the app.
 */
export function safeHref(raw: string | undefined | null): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://admark.local");
    const protocol = url.protocol.toLowerCase();
    if (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:" ||
      protocol === "tel:"
    ) {
      return value;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
