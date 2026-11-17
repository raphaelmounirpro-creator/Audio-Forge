import { describe, expect, it } from "vitest";
import {
  ffmpegArgs,
  nameFromUrl,
  outputName,
  validateDirectUrl,
  type ConversionOptions,
} from "./formats";

const base: ConversionOptions = {
  kind: "audio",
  format: "mp3",
  bitrate: 192,
  reencode: false,
  height: 0,
  title: "",
};

describe("arguments FFmpeg", () => {
  it("encode l'audio au débit choisi", () => {
    expect(ffmpegArgs("input.wav", "output.mp3", base)).toEqual([
      ...["-hide_banner", "-nostdin", "-y", "-i", "input.wav"],
      ...["-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
      "output.mp3",
    ]);
  });
  it("n'impose pas de débit aux formats sans perte", () => {
    const args = ffmpegArgs("i.mp3", "o.flac", { ...base, format: "flac" });
    expect(args).toContain("flac");
    expect(args).not.toContain("-b:a");
  });
  it("copie les flux vidéo sans réencodage par défaut", () => {
    const args = ffmpegArgs("i.mov", "o.mp4", {
      ...base,
      kind: "video",
      format: "mp4",
    });
    expect(args.join(" ")).toContain("-c copy");
    expect(args).toContain("+faststart");
    expect(args).not.toContain("-vf");
  });
  it("réduit la résolution lors d'un réencodage", () => {
    const args = ffmpegArgs("i.mkv", "o.webm", {
      ...base,
      kind: "video",
      format: "webm",
      reencode: true,
      height: 720,
    });
    expect(args).toContain("scale=-2:'min(720,ih)'");
    expect(args).toContain("libvpx");
    expect(args).toContain("libopus");
  });
  it("ajoute le titre comme argument séparé", () => {
    const args = ffmpegArgs("i.wav", "o.mp3", {
      ...base,
      title: ' a "b" ; c ',
    });
    expect(args.slice(-3)).toEqual(["-metadata", 'title=a "b" ; c', "o.mp3"]);
  });
});

describe("noms et liens", () => {
  it("remplace l'extension et retire les caractères interdits", () => {
    expect(outputName("Concert: live?.wav", "mp3")).toBe("Concert live.mp3");
    expect(outputName(".wav", "flac")).toBe("audioforge.flac");
  });
  it("refuse les pages vidéo et les liens non HTTPS", () => {
    expect(validateDirectUrl("https://www.youtube.com/watch?v=x")).toMatch(
      /application Windows/,
    );
    expect(validateDirectUrl("http://exemple.org/a.mp3")).toMatch(/HTTPS/);
    expect(validateDirectUrl("pas un lien")).toMatch(/valide/);
    expect(
      validateDirectUrl("https://upload.wikimedia.org/a/b/Son.ogg"),
    ).toBeNull();
  });
  it("déduit le nom du fichier depuis le lien", () => {
    expect(nameFromUrl("https://exemple.org/dossier/Mon%20son.ogg?x=1")).toBe(
      "Mon son.ogg",
    );
    expect(nameFromUrl("https://exemple.org/")).toBe("media");
  });
});
