import { createServerFn } from "@tanstack/react-start";

export type PortalRole = "admin" | "sales";

export type AuthStatus = {
  ok: boolean;
  role?: PortalRole;
  userId?: string;
  teamMemberId?: string | null;
  displayName?: string;
  username?: string;
};

export const getAuthStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthStatus> => {
    const core = await import("./auth-core.server");
    return core.handleGetAuthStatus();
  },
);

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => {
    if (!data || typeof data.username !== "string" || typeof data.password !== "string") {
      throw new Error("Invalid login payload.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const core = await import("./auth-core.server");
    return core.handleLogin(data);
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const core = await import("./auth-core.server");
  return core.handleLogout();
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
    const core = await import("./auth-core.server");
    return core.handleChangePassword(data);
  });

export const listPortalUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  const core = await import("./auth-core.server");
  return core.handleListPortalUsers();
});

export const createPortalUserFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      username: string;
      password: string;
      role: PortalRole;
      teamMemberId: string | null;
      displayName?: string;
    }) => {
      if (!data || typeof data.username !== "string" || typeof data.password !== "string") {
        throw new Error("Invalid create-user payload.");
      }
      if (data.role !== "admin" && data.role !== "sales") {
        throw new Error("Role must be admin or sales.");
      }
      return {
        username: data.username,
        password: data.password,
        role: data.role,
        teamMemberId: typeof data.teamMemberId === "string" ? data.teamMemberId : null,
        displayName: typeof data.displayName === "string" ? data.displayName : undefined,
      };
    },
  )
  .handler(async ({ data }) => {
    const core = await import("./auth-core.server");
    return core.handleCreatePortalUser(data);
  });

export const setPortalUserActiveFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; active: boolean }) => {
    if (!data || typeof data.id !== "string" || typeof data.active !== "boolean") {
      throw new Error("Invalid set-active payload.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const core = await import("./auth-core.server");
    return core.handleSetPortalUserActive(data);
  });

export const resetPortalUserPasswordFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; newPassword: string }) => {
    if (!data || typeof data.id !== "string" || typeof data.newPassword !== "string") {
      throw new Error("Invalid reset-password payload.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const core = await import("./auth-core.server");
    return core.handleResetPortalUserPassword(data);
  });
