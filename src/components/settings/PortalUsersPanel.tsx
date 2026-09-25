import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logClientError } from "@/lib/client-logger";
import type { CompanyMember } from "@/lib/types";
import {
  createPortalUserFn,
  listPortalUsersFn,
  resetPortalUserPasswordFn,
  setPortalUserActiveFn,
} from "@/server/auth-fns";

type PortalUserRow = {
  id: string;
  username: string;
  role: "admin" | "sales";
  teamMemberId: string | null;
  displayName: string;
  active: boolean;
};

export function PortalUsersPanel({ members }: { members: CompanyMember[] }) {
  const [users, setUsers] = useState<PortalUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    teamMemberId: "",
  });
  const [resetPasswordById, setResetPasswordById] = useState<Record<string, string>>({});

  const activeMembers = useMemo(
    () =>
      members
        .filter((member) => member.status !== "inactive")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  const reload = () => {
    setLoading(true);
    void listPortalUsersFn()
      .then((result) => setUsers(result.users))
      .catch((err) => {
        logClientError("settings.portalUsers.list", err);
        toast.error(err instanceof Error ? err.message : "Could not load portal users.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const memberName = (id: string | null) => {
    if (!id) return "—";
    return members.find((member) => member.id === id)?.name ?? id;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password || !form.teamMemberId) {
      toast.error("Username, password, and Team member are required.");
      return;
    }
    const member = members.find((item) => item.id === form.teamMemberId);
    setCreating(true);
    void createPortalUserFn({
      data: {
        username: form.username.trim(),
        password: form.password,
        role: "sales",
        teamMemberId: form.teamMemberId,
        displayName: member?.name,
      },
    })
      .then(() => {
        toast.success("Sales login created.");
        setForm({ username: "", password: "", teamMemberId: "" });
        reload();
      })
      .catch((err) => {
        logClientError("settings.portalUsers.create", err);
        toast.error(err instanceof Error ? err.message : "Could not create user.");
      })
      .finally(() => setCreating(false));
  };

  const toggleActive = (user: PortalUserRow) => {
    void setPortalUserActiveFn({ data: { id: user.id, active: !user.active } })
      .then(() => {
        toast.success(user.active ? "User deactivated." : "User activated.");
        reload();
      })
      .catch((err) => {
        logClientError("settings.portalUsers.active", err);
        toast.error(err instanceof Error ? err.message : "Could not update user.");
      });
  };

  const handleReset = (user: PortalUserRow) => {
    const nextPassword = resetPasswordById[user.id]?.trim() ?? "";
    if (!nextPassword) {
      toast.error("Enter a new password first.");
      return;
    }
    void resetPortalUserPasswordFn({ data: { id: user.id, newPassword: nextPassword } })
      .then(() => {
        toast.success(`Password reset for ${user.username}.`);
        setResetPasswordById((current) => ({ ...current, [user.id]: "" }));
      })
      .catch((err) => {
        logClientError("settings.portalUsers.reset", err);
        toast.error(err instanceof Error ? err.message : "Could not reset password.");
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Portal users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Named logins. Sales users only see Lead List and must be linked to a Team member.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-4"
      >
        <h3 className="text-sm font-medium text-foreground">Create sales login</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Username</span>
            <Input
              value={form.username}
              onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
              autoComplete="off"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Temporary password</span>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-muted-foreground">Linked Team member</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.teamMemberId}
              onChange={(e) =>
                setForm((current) => ({ ...current, teamMemberId: e.target.value }))
              }
              required
            >
              <option value="">Select member…</option>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.role ? ` · ${member.role}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create sales user"}
        </Button>
      </form>

      <div className="overflow-x-auto border-y border-border/80">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/80 text-xs text-muted-foreground">
              <th className="py-3 font-medium">User</th>
              <th className="py-3 font-medium">Role</th>
              <th className="py-3 font-medium">Team member</th>
              <th className="py-3 font-medium">Status</th>
              <th className="py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-muted-foreground">
                  No portal users yet — admin will bootstrap on first login.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="py-3">
                    <p className="font-medium text-foreground">{user.username}</p>
                    <p className="text-xs text-muted-foreground">{user.displayName}</p>
                  </td>
                  <td className="py-3 capitalize text-foreground">{user.role}</td>
                  <td className="py-3 text-muted-foreground">{memberName(user.teamMemberId)}</td>
                  <td className="py-3">
                    <span
                      className={
                        user.active ? "text-emerald-500" : "text-rose-500"
                      }
                    >
                      {user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col gap-2 sm:max-w-xs">
                      {user.role === "sales" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(user)}
                        >
                          {user.active ? "Deactivate" : "Activate"}
                        </Button>
                      ) : null}
                      {user.role === "sales" ? (
                        <div className="flex flex-wrap gap-2">
                          <Input
                            type="password"
                            placeholder="New password"
                            value={resetPasswordById[user.id] ?? ""}
                            onChange={(e) =>
                              setResetPasswordById((current) => ({
                                ...current,
                                [user.id]: e.target.value,
                              }))
                            }
                            className="h-9 min-w-[8rem] flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReset(user)}
                          >
                            Reset
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Change password in Security tab
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
