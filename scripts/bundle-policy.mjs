// yt-dlp, FFmpeg and Deno are downloaded on request by the application:
// the installer must never redistribute them.
const FORBIDDEN = /(?:^|[\\/])binaries(?:[\\/]|$)|\.(?:exe|dll)$/i;

/** Resource entries of tauri.conf.json that would ship third-party programs. */
export function bundledThirdPartyResources(conf) {
  const resources = conf?.bundle?.resources ?? [];
  const entries = Array.isArray(resources)
    ? resources
    : Object.entries(resources).flat();
  const external = conf?.bundle?.externalBin ?? [];
  return [...entries.filter((entry) => FORBIDDEN.test(entry)), ...external];
}
