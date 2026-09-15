import { createServerFn } from "@tanstack/react-start";
import {
  credentialsValid,
  ensurePortalPasswordLoaded,
  setPortalPassword,
} from "./app-auth-credentials";
import {
  assertAppSession,
  eraseSessionCookie,
  mintSessionCookieValue,
  sessionCookieValid,
  writeSessionCookie,
  rateLimitIp,
  rateLimitLogin,
} from "./app-session";
import { appendServerAuditLog } from "./activity-log-core";

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
  // Do not rate-limit auth status — every navigation calls this and would lock the UI.
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
    rateLimitLogin();
    rateLimitIp();
    await ensurePortalPasswordLoaded();

    // Do not apply "new password" strength rules to login — that locks out valid
    // legacy/env passwords. Strength is enforced only in changePasswordFn.

    if (!credentialsValid(data.username, data.password)) {
      await appendServerAuditLog({
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

    await appendServerAuditLog({
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

  await appendServerAuditLog({
    entity: "security",
    action: "logout",
    entityId: "login_system",
    entityName: "Session User",
    summary: `User initiated session termination (Sign out)`,
  });

  return { ok: true as const };
});

export const changePasswordFn = createServerFn({ method: "POST" })
  .inputValidator((data: { currentPassword: string; newPassword: string }) => {
    if (
      !data ||
      typeof data.currentPassword !== "string" ||
      typeof data.newPassword !== "string"
    ) {
      throw new Error("Invalid password change payload.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    rateLimitIp();

    validatePasswordStrength(data.newPassword);
    if (data.newPassword === data.currentPassword) {
      throw new Error("New password must be different from the current password.");
    }

    await setPortalPassword(data.currentPassword, data.newPassword);

    await appendServerAuditLog({
      entity: "security",
      action: "password_change",
      entityId: "login_system",
      entityName: "Session User",
      summary: "Portal password changed from Settings",
    });

    return { ok: true as const };
  });
