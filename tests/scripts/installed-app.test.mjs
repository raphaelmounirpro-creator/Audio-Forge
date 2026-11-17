import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_ARGUMENTS,
  installDirectory,
  isRunning,
  registryValues,
  sameProgram,
} from "../../scripts/installed-app.mjs";

const query = [
  "",
  "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AudioForge",
  "    (par défaut)    REG_SZ    C:\\Users\\Léa Martin\\AppData\\Local\\AudioForge",
  '    InstallLocation    REG_SZ    "C:\\Users\\Léa Martin\\AppData\\Local\\AudioForge"',
  "    DisplayVersion    REG_SZ    0.1.0",
  "    NoModify    REG_DWORD    0x1",
  "",
].join("\r\n");

test("lit l'emplacement et la version de l'installation", () => {
  const values = registryValues(query);
  assert.equal(values.DisplayVersion, "0.1.0");
  assert.equal(values.NoModify, "0x1");
  assert.equal(
    installDirectory(values),
    "C:\\Users\\Léa Martin\\AppData\\Local\\AudioForge",
  );
});

test("refuse un emplacement absent, relatif, réseau ou avec jokers", () => {
  for (const InstallLocation of [
    undefined,
    "",
    '"AudioForge"',
    '"\\\\serveur\\partage\\AudioForge"',
    '"C:\\Apps\\*"',
  ])
    assert.throws(() => installDirectory({ InstallLocation }));
});

test("détecte AudioForge ouvert d'après tasklist", () => {
  assert.equal(
    isRunning('"audioforge.exe","4242","Console","1","95 120 Ko"\r\n'),
    true,
  );
  assert.equal(isRunning('"AudioForge.EXE","1","Console","1","1 Ko"'), true);
  assert.equal(
    isRunning(
      "Informations : aucune tâche en service ne correspond aux critères spécifiés.\r\n",
    ),
    false,
  );
  assert.equal(
    isRunning('"audioforge-helper.exe","7","Console","1","1 Ko"'),
    false,
  );
});

test("compare le programme installé en ignorant seulement le type de paquet", () => {
  const program = (tag, tail = "fin") =>
    Buffer.from(
      `MZ début __TAURI_BUNDLE_TYPE_VAR_${tag}\u0000${tail}`,
      "latin1",
    );
  assert.equal(sameProgram(program("NSS"), program("UNK")), true);
  assert.equal(sameProgram(program("NSS"), program("NSS")), true);
  assert.equal(sameProgram(program("NSS", "fim"), program("UNK")), false);
  assert.equal(sameProgram(program("UNK"), program("UNK")), false);
  assert.equal(sameProgram(program("NSS"), program("DEB")), false);
  assert.equal(sameProgram(program("NSS"), program("UNK", "fin!")), false);
  assert.equal(
    sameProgram(
      Buffer.from("MZ sans marqueur"),
      Buffer.from("MZ sans marqueur"),
    ),
    false,
  );
});

test("met à jour sans désinstaller ni poser de question, puis relance", () => {
  assert.deepEqual(UPDATE_ARGUMENTS, ["/P", "/UPDATE", "/R"]);
});
