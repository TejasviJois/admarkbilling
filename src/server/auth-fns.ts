import { createServerFn } from "@tanstack/react-start";
import { credentialsValid } from "./app-auth-credentials";
import {
  eraseSessionCookie,
  mintSessionCookieValue,
  sessionCookieValid,
  writeSessionCookie,
  rateLimitIp,
} from "./app-session";
import { appendActivityLog } from "@/lib/activity-log-storage";

export { normalizeUsername } from "./app-auth-credentials";

// Password Strength Policy
export function validatePasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new Error("Security Policy Violation: Password must be at least 8 characters long.");
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(
      "Security Policy Violation: Password must contain uppercase, lowercase, and numeric characters.",
    );
  }
}

export const getAuthStatusFn = createServerFn({ method: "GET" }).handler(async () => ({
  ok: await sessionCookieValid(),
}));

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => {
    if (!data || typeof data.username !== "string" || typeof data.password !== "string") {
      throw new Error("Invalid login payload.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    rateLimitIp(); // Rate limit login requests

    // Check strength of the provided password
    try {
      validatePasswordStrength(data.password);
    } catch (strengthErr) {
      // Record failed login audit log due to weak password
      await appendActivityLog({
        entity: "security",
        action: "failed_login",
        entityId: "login_system",
        entityName: data.username,
        summary: `Failed login attempt (Weak password format) for user: ${data.username}`,
      });
      throw strengthErr;
    }

    if (!credentialsValid(data.username, data.password)) {
      // Security Audit Log: Failed Login
      await appendActivityLog({
        entity: "security",
        action: "failed_login",
        entityId: "login_system",
        entityName: data.username,
        summary: `Failed login attempt (Incorrect credentials) for user: ${data.username}`,
      });
      throw new Error("Invalid username or password.");
    }

    const token = await mintSessionCookieValue();
    writeSessionCookie(token);

    // Security Audit Log: Successful Login
    await appendActivityLog({
      entity: "security",
      action: "login",
      entityId: "login_system",
      entityName: data.username,
      summary: `Successful user login for: ${data.username}`,
    });

    return { ok: true as const };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  eraseSessionCookie();

  // Security Audit Log: Sign Out
  await appendActivityLog({
    entity: "security",
    action: "logout",
    entityId: "login_system",
    entityName: "Session User",
    summary: `User initiated session termination (Sign out)`,
  });

  return { ok: true as const };
});
