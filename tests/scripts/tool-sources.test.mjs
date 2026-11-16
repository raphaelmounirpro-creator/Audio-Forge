import { test } from "node:test";
import assert from "node:assert/strict";
import { stableFfmpegSource } from "../../scripts/tool-sources.mjs";
function responses(version, checksum) {
  return async (url) => ({
    ok: true,
    text: async () => (url.endsWith(".ver") ? version : checksum),
  });
}
test("source de release nommée et empreinte verrouillable", async () => {
  const result = await stableFfmpegSource(
    responses("9.0.2\n", "a".repeat(64) + "  archive.zip"),
  );
  assert.equal(
    result.url,
    "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip",
  );
  assert.equal(result.sha256, "a".repeat(64));
  assert.equal(result.license, "GPL-3.0-or-later");
});
test("refus des métadonnées malveillantes et empreintes absentes", async () => {
  await assert.rejects(
    () => stableFfmpegSource(responses("../../evil", "a".repeat(64))),
    /version/,
  );
  await assert.rejects(
    () => stableFfmpegSource(responses("9.0.2", "invalide")),
    /Empreinte/,
  );
});
test("aucune sélection si la source ne répond pas", async () => {
  await assert.rejects(
    () => stableFfmpegSource(async () => ({ ok: false, status: 503 })),
    /503/,
  );
});
