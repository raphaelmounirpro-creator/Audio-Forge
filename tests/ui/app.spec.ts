import { test, expect, type Page } from "@playwright/test";

/** One second of 440 Hz mono 16-bit PCM, as a WAV file. */
function wav(): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * 2);
  for (let i = 0; i < rate; i++)
    data.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000),
      i * 2,
    );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test("navigation, lien refusé et absence de débordement", async ({
  page,
}, testInfo) => {
  const errors = watch(page);
  await page.goto("/");
  if (testInfo.project.name === "text-zoom")
    await page.evaluate(() => {
      document.documentElement.style.zoom = "1.3";
    });
  await expect(
    page.getByRole("heading", {
      name: "Convertissez vos médias, sans les envoyer.",
    }),
  ).toBeVisible();
  await page
    .getByLabel("Ou un lien direct vers un fichier")
    .fill("https://www.youtube.com/watch?v=x");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("alert")).toContainText("application Windows");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  for (const label of ["Conversions", "À propos", "Convertir"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test("formulaire utilisable au clavier", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByText("Aller au contenu")).toBeFocused();
  await page.getByLabel("Ou un lien direct vers un fichier").focus();
  await page.keyboard.type("http://exemple.org/a.mp3");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("HTTPS");
});

test("convertit réellement un WAV en MP3 dans le navigateur", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "conversion vérifiée une seule fois",
  );
  test.setTimeout(120_000);
  const errors = watch(page);
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") uploads.push(request.url());
  });
  await page.goto("/");
  await page
    .getByLabel("Choisir des fichiers audio ou vidéo")
    .setInputFiles({
      name: "La 440.wav",
      mimeType: "audio/wav",
      buffer: wav(),
    });
  await page.getByLabel("Débit").selectOption("128");
  await page.getByRole("button", { name: "Lancer la conversion" }).click();
  const link = page.getByRole("link", { name: /Enregistrer La 440\.mp3/ });
  await expect(link).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    link.click(),
  ]);
  expect(download.suggestedFilename()).toBe("La 440.mp3");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(1000);
  // ID3 tag (title metadata) or an MPEG frame sync.
  const id3 = bytes.subarray(0, 3).toString("latin1") === "ID3";
  expect(id3 || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)).toBeTruthy();
  await expect(page.getByText("Moteur chargé")).toBeVisible();
  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
});
