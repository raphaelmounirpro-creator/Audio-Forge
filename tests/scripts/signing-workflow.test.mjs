import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
const workflow = parse(
  await readFile(
    new URL("../../.github/workflows/windows-signpath.yml", import.meta.url),
    "utf8",
  ),
);
test("la signature ne démarre que manuellement et reste désactivée par défaut", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    "push",
    "workflow_dispatch",
  ]);
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.sign.default, false);
  assert.deepEqual(workflow.permissions, { contents: "read", actions: "read" });
  assert.equal(workflow.jobs.windows["runs-on"], "windows-2025");
  assert.match(workflow.jobs.windows.if, /refs\/heads\/main/);
  for (const step of workflow.jobs.windows.steps.filter((step) => step.uses))
    assert.match(step.uses, /@[a-f0-9]{40}$/);
  for (const step of workflow.jobs.windows.steps.filter((step) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  ))
    assert.equal(
      step.if,
      "github.event_name == 'workflow_dispatch' && inputs.sign",
    );
});
test("le programme est signé avant NSIS et sa signature préservée pendant le packaging", () => {
  const steps = workflow.jobs.windows.steps;
  const signers = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.uses?.startsWith("signpath/"));
  assert.equal(signers.length, 2);
  const bundle = steps.findIndex((step) =>
    step.run?.includes("bundle --bundles nsis"),
  );
  assert.ok(signers[0].index < bundle && bundle < signers[1].index);
  assert.match(steps[bundle].run, /--no-binary-patching/);
  for (const { step } of signers) {
    assert.equal(
      step.if,
      "github.event_name == 'workflow_dispatch' && inputs.sign",
    );
    assert.match(step.with.parameters, /version:/);
    assert.equal(step.with["wait-for-completion"], true);
  }
  assert.equal(
    steps.find((step) => step.id === "unsigned-app").with.path,
    "src-tauri/target/release/audioforge.exe",
  );
});
