import { readFile } from "node:fs/promises";
import { syncNotices } from "./tool-notices.mjs";
import { verifyDependencyNotices } from "./dependency-notices.mjs";
import { bundledThirdPartyResources } from "./bundle-policy.mjs";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const root = "src-tauri/binaries";
await syncNotices(
  root,
  await json(`${root}/sources.lock.json`),
  await json(`${root}/notices.lock.json`),
);
await verifyDependencyNotices(".");
const bundled = bundledThirdPartyResources(
  await json("src-tauri/tauri.conf.json"),
);
if (bundled.length)
  throw new Error(
    `L’installateur embarquerait des programmes tiers : ${bundled.join(", ")}`,
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
