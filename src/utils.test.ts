import { describe, expect, it } from "vitest";
import type { DownloadRequest } from "./types";
import {
  cleanupMessage,
  duration,
  formatLabel,
  outputKey,
  splitUrls,
  validateUrl,
} from "./utils";
const mp3: DownloadRequest = {
  url: "https://vimeo.com/1",
  title: "Titre",
  kind: "audio",
  format: "mp3",
  quality: 0,
  bitrate: 192,
  destination: "C:\\Musique",
  metadata: true,
};
describe("formats et doublons", () => {
  it("ignore les options sans effet sur le fichier, comme le moteur", () => {
    expect(outputKey({ ...mp3, quality: 720 })).toBe(outputKey(mp3));
    expect(outputKey({ ...mp3, bitrate: 320 })).not.toBe(outputKey(mp3));
    const flac = { ...mp3, format: "flac" };
    expect(outputKey({ ...flac, bitrate: 320 })).toBe(outputKey(flac));
    const video = { ...mp3, kind: "video" as const, format: "mp4" };
    expect(outputKey({ ...video, quality: 1080 })).not.toBe(outputKey(video));
    expect(formatLabel(mp3)).toBe("MP3 192 kb/s");
    expect(formatLabel({ ...video, quality: 1080 })).toBe("MP4 1080p");
    expect(formatLabel({ ...flac, format: "original" })).toBe("Original");
  });
  it("résume le nettoyage sans masquer les échecs", () => {
    expect(cleanupMessage({ removed: 2, recycled: 0, failed: 0 })).toBe(
      "2 doublons retirés de l’historique.",
    );
    expect(cleanupMessage({ removed: 1, recycled: 1, failed: 2 })).toBe(
      "1 doublon retiré de l’historique, 1 fichier placé dans la corbeille de Windows. 2 éléments non traités sont conservés.",
    );
  });
});
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
