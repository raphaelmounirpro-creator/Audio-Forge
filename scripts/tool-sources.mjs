export async function stableFfmpegSource(fetcher = fetch) {
  async function text(url) {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(
        `Métadonnées FFmpeg indisponibles : HTTP ${response.status}`,
      );
    return (await response.text()).trim();
  }
  const version = await text(
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.ver",
  );
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version))
    throw new Error("Numéro de version FFmpeg inattendu.");
  const checksum = await text(
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256",
  );
  const sha256 = checksum.split(/\s+/)[0].toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("Empreinte de distribution absente.");
  return {
    repository: "GyanD/codexffmpeg",
    version,
    url: `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-${version}-essentials_build.zip`,
    sha256,
    files: ["ffmpeg.exe", "ffprobe.exe"],
    release: "https://www.gyan.dev/ffmpeg/builds/",
    license: "GPL-3.0-or-later",
  };
}
