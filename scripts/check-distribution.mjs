import { readFile } from "node:fs/promises";
import { syncNotices } from "./tool-notices.mjs";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const root = "src-tauri/binaries";
await syncNotices(
  root,
  await json(`${root}/sources.lock.json`),
  await json(`${root}/notices.lock.json`),
);
const audit = await json("docs/distribution/STATUS.json");
const { version } = await json("package.json");
if (
  audit.version !== version ||
  audit.reviewedForPublicBinaryDistribution !== true ||
  audit.blockers.length
) {
  console.error("Distribution publique de l’installateur bloquée :");
  for (const blocker of audit.blockers) console.error(`- ${blocker}`);
  process.exitCode = 1;
}
