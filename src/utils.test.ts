import { describe, expect, it } from "vitest";
import { duration, splitUrls, validateUrl } from "./utils";
describe("liens et affichage", () => {
  it("dédoublonne les liens d’un lot", () =>
    expect(
      splitUrls(
        "https://vimeo.com/1\n https://vimeo.com/1 https://vimeo.com/2",
      ),
    ).toHaveLength(2));
  it.each([
    "file:///C:/secret",
    "http://youtube.com",
    "https://user:secret@youtube.com",
    "https://youtube.com.evil.test",
    "https://127.0.0.1",
    "https://youtube.com:444/",
    "https://youtube.com/#fragment",
  ])("rejette %s", (url) => expect(validateUrl(url)).not.toBeNull());
  it("accepte les domaines compatibles exacts", () =>
    expect(validateUrl("https://www.youtube.com/watch?v=abc")).toBeNull());
  it("gère les durées inconnues et longues", () => {
    expect(duration(null)).toBe("Durée inconnue");
    expect(duration(3661)).toBe("1 h 1 min");
  });
});
