import { describe, it, expect } from "vitest";
import { diffAction } from "@/lib/audit";

describe("diffAction", () => {
  it("returns create when before is null", () => {
    expect(diffAction(null, { key: "v" })).toBe("create");
  });
  it("returns delete when after is null", () => {
    expect(diffAction({ key: "v" }, null)).toBe("delete");
  });
  it("returns update when both present", () => {
    expect(diffAction({ key: "v", label: "old" }, { key: "v", label: "new" })).toBe("update");
  });
});
