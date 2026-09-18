import { describe, expect, it } from "vitest";
import { createRescueCommand } from "../rescue.js";

describe("rescue command", () => {
  it("exposes the complete Measure, Repair, Guard, Prove journey", () => {
    const command = createRescueCommand();
    expect(command.name()).toBe("rescue");
    expect(command.commands.map((child) => child.name())).toEqual([
      "plan",
      "apply",
      "verify",
      "guard",
      "report",
      "rollback",
    ]);
  });

  it("requires explicit plan approval before applying fixes", () => {
    const command = createRescueCommand();
    const apply = command.commands.find((child) => child.name() === "apply");
    expect(
      apply?.options.some(
        (option) => option.long === "--approve" && option.mandatory,
      ),
    ).toBe(true);
  });
});
