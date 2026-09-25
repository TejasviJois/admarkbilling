/**
 * Portal multi-user store.
 * Primary: admark.portal_users (when migration applied).
 * Fallback: settings.feature_toggles.portalUsers (works without SQL migrate).
 */
import { expectedPassword, expectedUsername, normalizeUsername } from "./app-auth-credentials";
import { getSupabaseServerConfig } from "./env";
import { hashPassword } from "./password-hash";
import { requireServerSupabase } from "./supabase-admin";

export type PortalRole = "admin" | "sales";

export type PortalUser = {
  id: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
  role: PortalRole;
  teamMemberId: string | null;
  displayName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PortalUserPublic = Omit<PortalUser, "passwordHash">;

type PortalUserRow = {
  id: string;
  username: string;
  username_normalized: string;
  password_hash: string;
  role: string;
  team_member_legacy_id: string | null;
  display_name: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

let bootstrapPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToUser(row: PortalUserRow): PortalUser {
  return {
    id: row.id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    passwordHash: row.password_hash,
    role: row.role === "sales" ? "sales" : "admin",
    teamMemberId: row.team_member_legacy_id,
    displayName: row.display_name?.trim() || row.username,
    active: row.active === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseToggleUser(raw: unknown): PortalUser | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  const username = typeof raw.username === "string" ? raw.username : null;
  const usernameNormalized =
    typeof raw.usernameNormalized === "string"
      ? raw.usernameNormalized
      : username
        ? normalizeUsername(username)
        : null;
  const passwordHash = typeof raw.passwordHash === "string" ? raw.passwordHash : null;
  const role = raw.role === "sales" || raw.role === "admin" ? raw.role : null;
  if (!id || !username || !usernameNormalized || !passwordHash || !role) return null;
  return {
    id,
    username,
    usernameNormalized,
    passwordHash,
    role,
    teamMemberId: typeof raw.teamMemberId === "string" ? raw.teamMemberId : null,
    displayName:
      typeof raw.displayName === "string" && raw.displayName.trim()
        ? raw.displayName.trim()
        : username,
    active: raw.active !== false,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function toPublic(user: PortalUser): PortalUserPublic {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

async function readFeatureToggleUsers(): Promise<PortalUser[]> {
  try {
    if (!getSupabaseServerConfig()) return [];
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .schema("admark")
      .from("settings")
      .select("feature_toggles")
      .limit(1)
      .maybeSingle();
    if (error || !data) return [];
    const toggles = isRecord(data.feature_toggles) ? data.feature_toggles : {};
    const raw = toggles.portalUsers;
    if (!Array.isArray(raw)) return [];
    return raw.map(parseToggleUser).filter((user): user is PortalUser => user != null);
  } catch {
    return [];
  }
}

async function writeFeatureToggleUsers(users: PortalUser[]): Promise<void> {
  if (!getSupabaseServerConfig()) {
    throw new Error("Supabase is required to store portal users.");
  }
  const sb = requireServerSupabase();
  const { data: row, error } = await sb
    .schema("admark")
    .from("settings")
    .select("id, feature_toggles")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row?.id) throw new Error("settings row missing — cannot store portal users.");
  const existing = isRecord(row.feature_toggles) ? row.feature_toggles : {};
  const { error: updateError } = await sb
    .schema("admark")
    .from("settings")
    .update({
      feature_toggles: {
        ...existing,
        portalUsers: users.map((user) => ({
          id: user.id,
          username: user.username,
          usernameNormalized: user.usernameNormalized,
          passwordHash: user.passwordHash,
          role: user.role,
          teamMemberId: user.teamMemberId,
          displayName: user.displayName,
          active: user.active,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      },
    })
    .eq("id", row.id);
  if (updateError) throw updateError;
}

async function tryListFromTable(): Promise<PortalUser[] | null> {
  try {
    if (!getSupabaseServerConfig()) return null;
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .schema("admark")
      .from("portal_users")
      .select(
        "id, username, username_normalized, password_hash, role, team_member_legacy_id, display_name, active, created_at, updated_at",
      );
    if (error) {
      // Undefined table / schema cache — fall back to feature_toggles.
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        /portal_users|does not exist|schema cache/i.test(error.message)
      ) {
        return null;
      }
      throw error;
    }
    return (data ?? []).map((row) => rowToUser(row as PortalUserRow));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/portal_users|does not exist|schema cache/i.test(message)) return null;
    throw error;
  }
}

async function tryUpsertTable(user: PortalUser): Promise<boolean> {
  try {
    if (!getSupabaseServerConfig()) return false;
    const sb = requireServerSupabase();
    const { data: org } = await sb
      .schema("admark")
      .from("organizations")
      .select("id")
      .eq("legacy_id", "org-admark-digitals")
      .maybeSingle();
    if (!org?.id) return false;
    const { error } = await sb.schema("admark").from("portal_users").upsert(
      {
        id: user.id,
        organization_id: org.id,
        username: user.username,
        username_normalized: user.usernameNormalized,
        password_hash: user.passwordHash,
        role: user.role,
        team_member_legacy_id: user.teamMemberId,
        display_name: user.displayName,
        active: user.active,
        updated_at: user.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        /portal_users|does not exist|schema cache/i.test(error.message)
      ) {
        return false;
      }
      throw error;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/portal_users|does not exist|schema cache/i.test(message)) return false;
    throw error;
  }
}

/** List all portal users (secrets included — server only). */
export async function listPortalUsers(): Promise<PortalUser[]> {
  const fromTable = await tryListFromTable();
  if (fromTable && fromTable.length > 0) return fromTable;
  const fromToggles = await readFeatureToggleUsers();
  if (fromToggles.length > 0) return fromToggles;
  return fromTable ?? [];
}

export async function listPortalUsersPublic(): Promise<PortalUserPublic[]> {
  return (await listPortalUsers()).map(toPublic);
}

export async function findPortalUserByUsername(username: string): Promise<PortalUser | null> {
  const normalized = normalizeUsername(username);
  const users = await listPortalUsers();
  return users.find((user) => user.usernameNormalized === normalized) ?? null;
}

export async function findPortalUserById(id: string): Promise<PortalUser | null> {
  const users = await listPortalUsers();
  return users.find((user) => user.id === id) ?? null;
}

async function persistUsers(users: PortalUser[]): Promise<void> {
  await writeFeatureToggleUsers(users);
  for (const user of users) {
    await tryUpsertTable(user);
  }
}

export async function ensurePortalUsersBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const existing = await listPortalUsers();
      if (existing.length > 0) return;

      const { ensurePortalPasswordLoaded } = await import("./app-auth-credentials");
      await ensurePortalPasswordLoaded();
      const username = expectedUsername();
      const password = expectedPassword();
      const now = nowIso();
      const admin: PortalUser = {
        id: newId(),
        username,
        usernameNormalized: normalizeUsername(username),
        passwordHash: await hashPassword(password),
        role: "admin",
        teamMemberId: null,
        displayName: username,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      await persistUsers([admin]);
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  await bootstrapPromise;
}

export async function createPortalUser(input: {
  username: string;
  password: string;
  role: PortalRole;
  teamMemberId: string | null;
  displayName?: string;
}): Promise<PortalUserPublic> {
  await ensurePortalUsersBootstrapped();
  const username = input.username.trim();
  if (!username) throw new Error("Username is required.");
  const normalized = normalizeUsername(username);
  const users = await listPortalUsers();
  if (users.some((user) => user.usernameNormalized === normalized)) {
    throw new Error("That username is already taken.");
  }
  if (input.role === "sales" && !input.teamMemberId?.trim()) {
    throw new Error("Sales users must be linked to a Team member.");
  }
  const now = nowIso();
  const user: PortalUser = {
    id: newId(),
    username,
    usernameNormalized: normalized,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    teamMemberId: input.teamMemberId?.trim() || null,
    displayName: input.displayName?.trim() || username,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await persistUsers([...users, user]);
  return toPublic(user);
}

export async function setPortalUserActive(id: string, active: boolean): Promise<PortalUserPublic> {
  await ensurePortalUsersBootstrapped();
  const users = await listPortalUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index < 0) throw new Error("Portal user not found.");
  const target = users[index]!;
  if (target.role === "admin" && !active) {
    const otherAdmins = users.filter((user) => user.role === "admin" && user.active && user.id !== id);
    if (otherAdmins.length === 0) {
      throw new Error("Cannot deactivate the last active admin.");
    }
  }
  const next: PortalUser = { ...target, active, updatedAt: nowIso() };
  const updated = [...users];
  updated[index] = next;
  await persistUsers(updated);
  return toPublic(next);
}

export async function resetPortalUserPassword(id: string, newPassword: string): Promise<void> {
  await ensurePortalUsersBootstrapped();
  const users = await listPortalUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index < 0) throw new Error("Portal user not found.");
  const next: PortalUser = {
    ...users[index]!,
    passwordHash: await hashPassword(newPassword),
    updatedAt: nowIso(),
  };
  const updated = [...users];
  updated[index] = next;
  await persistUsers(updated);
}

/** Update the primary admin password (Settings → Change password). */
export async function updateAdminPasswordHash(newPassword: string): Promise<void> {
  await ensurePortalUsersBootstrapped();
  const users = await listPortalUsers();
  const adminIndex = users.findIndex((user) => user.role === "admin" && user.active);
  if (adminIndex < 0) throw new Error("No active admin user to update.");
  const next: PortalUser = {
    ...users[adminIndex]!,
    passwordHash: await hashPassword(newPassword),
    updatedAt: nowIso(),
  };
  const updated = [...users];
  updated[adminIndex] = next;
  await persistUsers(updated);
}

export function actorLabelForUser(user: Pick<PortalUser, "displayName" | "username" | "role">): string {
  const name = user.displayName || user.username;
  return user.role === "sales" ? `${name} (sales)` : name;
}
