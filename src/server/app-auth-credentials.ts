const DEFAULT_USERNAME = "Admark Digitals";
const DEFAULT_PASSWORD = "HTRP@2026";

function expectedUsername(): string {
  return process.env.ADMARK_APP_USERNAME?.trim() || DEFAULT_USERNAME;
}

function expectedPassword(): string {
  const env = process.env.ADMARK_APP_PASSWORD;
  if (process.env.NODE_ENV === "production") {
    if (!env?.trim()) {
      throw new Error(
        "ADMARK_APP_PASSWORD must be set in production (Vercel → Environment Variables).",
      );
    }
    return env;
  }
  return env ?? DEFAULT_PASSWORD;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function credentialsValid(username: string, password: string): boolean {
  const userOk = normalizeUsername(username) === normalizeUsername(expectedUsername());
  const passOk = password === expectedPassword();
  return userOk && passOk;
}
