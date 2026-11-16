import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const root = resolve(".local/sandbox/output");
for (const name of (await readdir(root))
  .filter((v) => v.startsWith("build-"))
  .sort()
  .reverse()
  .slice(0, 3)) {
  try {
    const result = JSON.parse(
      await readFile(join(root, name, "result.json"), "utf8"),
    );
    console.log(`${name} : ${result.state}`);
    for (const step of result.steps)
      console.log(
        `  ${step.name} : ${step.exitCode === 0 ? "réussi" : "échec " + step.exitCode}`,
      );
    if (result.error) console.log("  " + result.error);
    for (const item of result.installers)
      console.log("  Installateur : " + join(root, name, item.name));
    if (result.state === "preparing" || result.state === "building")
      console.log(
        (await readFile(join(root, name, "build.log"), "utf8"))
          .split(/\r?\n/)
          .slice(-8)
          .join("\n"),
      );
  } catch (error) {
    console.log(name + " : journal indisponible (" + error.message + ")");
  }
}
