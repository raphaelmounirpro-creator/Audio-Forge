import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const directory = resolve(".local/installers");
await mkdir(directory, { recursive: true });
const source = "https://aka.ms/vs/17/release/vs_BuildTools.exe";
const response = await fetch(source, { signal: AbortSignal.timeout(120_000) });
if (!response.ok || !response.url.startsWith("https://"))
  throw new Error("Récupération Microsoft refusée.");
const bytes = Buffer.from(await response.arrayBuffer());
await writeFile(join(directory, "vs_BuildTools.exe"), bytes);
await writeFile(
  join(directory, "build-tools-source.json"),
  JSON.stringify(
    {
      source,
      resolvedUrl: response.url,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Programme Microsoft récupéré ; sa signature doit être validée avant installation.",
);
