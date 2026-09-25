/**
 * Server-only auth implementations. Imported dynamically from auth-fns handlers
 * so the client never pulls node:crypto / Start server APIs into the browser bundle.
 */
import {
  ensurePortalPasswordLoaded,
  isKnownInsecurePassword,
} from "./app-auth-credentials";
import {
  clearLoginRateLimit,
  eraseSessionCookie,
  mintSessionCookieValue,
  rateLimitFailedLogin,
  rateLimitIp,
  readSessionFromCookie,
  requireAdmin,
  requireSession,
  writeSessionCookie,
} from "./app-session.server";
import { appendServerAuditLog } from "./activity-log-core";
import { verifyPassword } from "./password-hash";
import {
  actorLabelForUser,
  createPortalUser,
  ensurePortalUsersBootstrapped,
  findPortalUserByUsername,
  listPortalUsersPublic,
  resetPortalUserPassword,
  setPortalUserActive,
  updateAdminPasswordHash,
  type PortalRole,
} from "./portal-users";

export type { PortalRole };

export type AuthStatus = {
  ok: boolean;
  role?: PortalRole;
  userId?: string;
  teamMemberId?: string | null;
  displayName?: string;
  username?: string;
};

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

export async function handleGetAuthStatus(): Promise<AuthStatus> {
  const session = await readSessionFromCookie();
  if (!session) return { ok: false };

  try {
    await ensurePortalUsersBootstrapped();
    const user = await findPortalUserByUsername(session.username);
    if (!user || !user.active || user.id !== session.userId) {
      eraseSessionCookie();
      return { ok: false };
    }

    const live: AuthStatus = {
      ok: true,
      role: user.role,
      userId: user.id,
      teamMemberId: user.teamMemberId,
      displayName: user.displayName || user.username,
      username: user.username,
    };

    writeSessionCookie(
      await mintSessionCookieValue({
        userId: live.userId!,
        role: live.role!,
        teamMemberId: live.teamMemberId ?? null,
        displayName: live.displayName!,
        username: live.username!,
      }),
    );

    return live;
  } catch {
    // Fail closed in production; allow cookie recovery only in development.
    if (process.env.NODE_ENV === "production") {
      eraseSessionCookie();
      return { ok: false };
    }
  }

  writeSessionCookie(
    await mintSessionCookieValue({
      userId: session.userId,
      role: session.role,
      teamMemberId: session.teamMemberId,
      displayName: session.displayName,
      username: session.username,
    }),
  );

  return {
    ok: true,
    role: session.role,
    userId: session.userId,
    teamMemberId: session.teamMemberId,
    displayName: session.displayName,
    username: session.username,
  };
}

export async function handleLogin(data: { username: string; password: string }) {
  rateLimitIp();
  await ensurePortalPasswordLoaded();
  await ensurePortalUsersBootstrapped();

  const user = await findPortalUserByUsername(data.username);
  const passwordOk = user ? await verifyPassword(data.password, user.passwordHash) : false;

  if (!user || !user.active || !passwordOk) {
    rateLimitFailedLogin(data.username);
    await appendServerAuditLog({
      entity: "security",
      action: "failed_login",
      entityId: "login_system",
      entityName: data.username,
      summary: `Failed login attempt (Incorrect credentials) for user: ${data.username}`,
    });
    throw new Error("Invalid username or password.");
  }

  clearLoginRateLimit(data.username);
  const token = await mintSessionCookieValue({
    userId: user.id,
    role: user.role,
    teamMemberId: user.teamMemberId,
    displayName: user.displayName,
    username: user.username,
  });
  writeSessionCookie(token);

  await appendServerAuditLog({
    entity: "security",
    action: "login",
    entityId: "login_system",
    entityName: actorLabelForUser(user),
    summary: `Successful user login for: ${actorLabelForUser(user)}`,
  });

  return {
    ok: true as const,
    role: user.role,
    userId: user.id,
    teamMemberId: user.teamMemberId,
    displayName: user.displayName,
  };
}

export async function handleLogout() {
  const session = await readSessionFromCookie();
  eraseSessionCookie();

  await appendServerAuditLog({
    entity: "security",
    action: "logout",
    entityId: "login_system",
    entityName: session ? actorLabelForUser(session) : "Session User",
    summary: `User initiated session termination (Sign out)`,
  });

  return { ok: true as const };
}

export async function handleChangePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  const session = await requireAdmin();
  rateLimitIp();

  validatePasswordStrength(data.newPassword);
  if (data.newPassword === data.currentPassword) {
    throw new Error("New password must be different from the current password.");
  }
  if (isKnownInsecurePassword(data.newPassword)) {
    throw new Error("Choose a stronger password — that value is a known insecure default.");
  }

  const user = await findPortalUserByUsername(session.username);
  if (!user || !(await verifyPassword(data.currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect.");
  }

  await updateAdminPasswordHash(data.newPassword);
  const store = await import("./portal-auth-store");
  store.writePortalAuthOverride({ password: data.newPassword });
  await store.writePortalPasswordToCloud(data.newPassword);

  await appendServerAuditLog({
    entity: "security",
    action: "password_change",
    entityId: "login_system",
    entityName: actorLabelForUser(session),
    summary: "Portal password changed from Settings",
  });

  return { ok: true as const };
}

export async function handleListPortalUsers() {
  await requireAdmin();
  await ensurePortalUsersBootstrapped();
  return { users: await listPortalUsersPublic() };
}

export async function handleCreatePortalUser(data: {
  username: string;
  password: string;
  role: PortalRole;
  teamMemberId: string | null;
  displayName?: string;
}) {
  const session = await requireAdmin();
  validatePasswordStrength(data.password);
  if (isKnownInsecurePassword(data.password)) {
    throw new Error("Choose a stronger password — that value is a known insecure default.");
  }
  if (data.role !== "sales") {
    throw new Error("Only sales users can be created from Settings.");
  }
  const user = await createPortalUser({
    username: data.username,
    password: data.password,
    role: "sales",
    teamMemberId: data.teamMemberId,
    displayName: data.displayName,
  });
  await appendServerAuditLog({
    entity: "security",
    action: "created",
    entityId: user.id,
    entityName: user.username,
    summary: `${actorLabelForUser(session)} created sales login ${user.username}`,
  });
  return { user };
}

export async function handleSetPortalUserActive(data: { id: string; active: boolean }) {
  const session = await requireAdmin();
  const user = await setPortalUserActive(data.id, data.active);
  await appendServerAuditLog({
    entity: "security",
    action: "updated",
    entityId: user.id,
    entityName: user.username,
    summary: `${actorLabelForUser(session)} ${data.active ? "activated" : "deactivated"} ${user.username}`,
  });
  return { user };
}

export async function handleResetPortalUserPassword(data: { id: string; newPassword: string }) {
  const session = await requireAdmin();
  validatePasswordStrength(data.newPassword);
  if (isKnownInsecurePassword(data.newPassword)) {
    throw new Error("Choose a stronger password — that value is a known insecure default.");
  }
  await resetPortalUserPassword(data.id, data.newPassword);
  await appendServerAuditLog({
    entity: "security",
    action: "password_change",
    entityId: data.id,
    entityName: data.id,
    summary: `${actorLabelForUser(session)} reset password for portal user ${data.id}`,
  });
  return { ok: true as const };
}

export async function currentActorLabel(): Promise<string> {
  try {
    const session = await requireSession();
    return actorLabelForUser(session);
  } catch {
    return "Admin (shared session)";
  }
}
