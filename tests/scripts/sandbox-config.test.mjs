import { test } from "node:test";
import assert from "node:assert/strict";
import { sandboxXml } from "../../scripts/sandbox-config.mjs";
test("le presse-papiers est activé uniquement sur choix explicite", () => {
  assert.match(
    sandboxXml([]),
    /<ClipboardRedirection>Disable<\/ClipboardRedirection>/,
  );
  assert.match(
    sandboxXml([], { clipboardRedirection: true }),
    /<ClipboardRedirection>Enable<\/ClipboardRedirection>/,
  );
  assert.throws(
    () => sandboxXml([], { clipboardRedirection: "Enable" }),
    /presse-papiers/,
  );
});
test("configuration dédiée à l’application : mémoire limitée et commande échappée", () => {
  const xml = sandboxXml([], { memoryMb: 4096, command: 'cmd.exe /c "a&b"' });
  assert.match(xml, /<MemoryInMB>4096<\/MemoryInMB>/);
  assert.match(xml, /cmd.exe \/c &quot;a&amp;b&quot;/);
  assert.throws(() => sandboxXml([], { memoryMb: 1 }), /Mémoire/);
});
test("seuls les exports sont modifiables et les chemins XML sont échappés", () => {
  const xml = sandboxXml([
    { host: "C:\\A & B", guest: "C:\\Inputs\\Source", readOnly: true },
    { host: "C:\\Output", guest: "C:\\Exports", readOnly: false },
  ]);
  assert.match(xml, /A &amp; B/);
  assert.equal((xml.match(/<ReadOnly>false<\/ReadOnly>/g) ?? []).length, 1);
  assert.match(xml, /<ClipboardRedirection>Disable/);
  assert.match(xml, /<VGpu>Disable/);
  assert.match(xml, /node\.exe C:\\Inputs\\Source\\sandbox-build\.mjs/);
});
