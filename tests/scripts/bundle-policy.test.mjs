import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundledThirdPartyResources } from "../../scripts/bundle-policy.mjs";

test("l'installateur ne contient aucun exécutable tiers", async () => {
  const conf = JSON.parse(
    await readFile(
      new URL("../../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(bundledThirdPartyResources(conf), []);
});

test("les ressources ou sidecars qui embarqueraient des programmes sont détectés", () => {
  for (const conf of [
    { bundle: { resources: ["notices/**/*", "binaries/*"] } },
    { bundle: { resources: { "binaries/ffmpeg.exe": "ffmpeg.exe" } } },
    { bundle: { resources: ["outils\\yt-dlp.exe"] } },
    { bundle: { externalBin: ["binaries/deno"] } },
  ])
    assert.notDeepEqual(
      bundledThirdPartyResources(conf),
      [],
      JSON.stringify(conf),
    );
  assert.deepEqual(
    bundledThirdPartyResources({ bundle: { resources: ["notices/**/*"] } }),
    [],
  );
});
