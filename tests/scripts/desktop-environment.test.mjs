import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopEnvironment } from "../../scripts/desktop-environment.mjs";
test("conserve le chemin portable de Rust quand Windows expose Path", () => {
  const result = desktopEnvironment(
    {
      Path: "C:\\Inputs\\Rust\\bin;C:\\Windows",
      USERPROFILE: "C:\\Users\\WDAGUtilityAccount",
    },
    "C:\\Build\\AudioForge",
  );
  assert.ok(result.PATH.endsWith("C:\\Inputs\\Rust\\bin;C:\\Windows"));
  assert.equal(
    Object.keys(result).filter((k) => k.toUpperCase() === "PATH").length,
    1,
  );
});
test("conserve aussi PATH et ne modifie pas son entrée", () => {
  const source = { PATH: "C:\\Rust\\bin" };
  const result = desktopEnvironment(source, "C:\\Build");
  assert.ok(result.PATH.endsWith("C:\\Rust\\bin"));
  assert.deepEqual(source, { PATH: "C:\\Rust\\bin" });
});
