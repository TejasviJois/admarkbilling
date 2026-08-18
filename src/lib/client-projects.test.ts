import { describe, expect, it } from "vitest";
import {
  countClientProjects,
  formatProjectStatusCounts,
  projectsForClientRelationship,
} from "./client-projects";
import type { Client, Project } from "./types";

describe("client project counts", () => {
  it("formats ongoing and completed together", () => {
    expect(formatProjectStatusCounts({ active: 1, completed: 2 })).toBe("1 ongoing + 2 completed");
    expect(formatProjectStatusCounts({ active: 0, completed: 3 })).toBe("3 completed");
    expect(formatProjectStatusCounts({ active: 1, completed: 0 })).toBe("1 ongoing");
  });

  it("counts parent and child company projects, not child companies", () => {
    const parent: Client = {
      id: "cli-safe",
      companyName: "Safewheels Group",
      contactPerson: "Safe",
      phone: "",
      email: "",
      billingAddress: "",
      clientSince: "2026-01-01",
      status: "active",
    };
    const children: Client[] = [
      { ...parent, id: "cli-kapila", parentClientId: "cli-safe", companyName: "Kapila Management Software" },
      { ...parent, id: "cli-faq", parentClientId: "cli-safe", companyName: "Kapila FAQ" },
    ];
    const projects: Project[] = [
      { id: "p1", clientId: "cli-kapila", client: "Kapila Management Software", status: "active" },
      { id: "p2", clientId: "cli-faq", client: "Kapila FAQ", status: "completed" },
      { id: "p3", client: "Safewheels Group", status: "completed" },
    ];

    const related = projectsForClientRelationship(projects, parent, [parent, ...children]);
    expect(related).toHaveLength(3);
    expect(countClientProjects(related)).toEqual({ active: 1, completed: 2 });
  });
});
