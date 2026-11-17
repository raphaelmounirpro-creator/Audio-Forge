import type { Cleanup, DownloadRequest, Status, Task } from "./types";

export const statuses: Record<Status, string> = {
  queued: "En attente",
  analyzing: "Analyse",
  downloading: "Téléchargement",
  processing: "Traitement",
  completed: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
  interrupted: "Interrompu",
};
export const terminal = (s: Status) =>
  ["completed", "failed", "cancelled", "interrupted"].includes(s);
export const duration = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "Durée inconnue";
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
    : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n > 1 ? many : word}`;
type Output = Pick<DownloadRequest, "kind" | "format" | "quality" | "bitrate">;
/** Same rule as the engine: quality only for video, bitrate only for MP3. */
export const outputKey = (r: Output) =>
  [
    r.kind,
    r.format,
    r.kind === "video" ? r.quality : 0,
    r.format === "mp3" ? r.bitrate : 0,
  ].join(":");
export function formatLabel(r: Output): string {
  const name = r.format === "original" ? "Original" : r.format.toUpperCase();
  if (r.format === "mp3") return `${name} ${r.bitrate} kb/s`;
  return r.kind === "video" && r.quality ? `${name} ${r.quality}p` : name;
}
export const sortOrders = {
  newest: "Plus récents d’abord",
  oldest: "Plus anciens d’abord",
  title: "Titre (A → Z)",
  "title-desc": "Titre (Z → A)",
  format: "Format",
} as const;
export type SortOrder = keyof typeof sortOrders;
const collator = new Intl.Collator("fr", {
  sensitivity: "base",
  numeric: true,
});
const byTitle = (a: Task, b: Task) =>
  collator.compare(a.request.title, b.request.title);
export function sortTasks(list: Task[], order: SortOrder): Task[] {
  // The stable sort keeps insertion order between tasks of the same second.
  const oldest = [...list].sort((a, b) => a.createdAt - b.createdAt);
  if (order === "oldest") return oldest;
  const newest = oldest.reverse();
  if (order === "newest") return newest;
  if (order === "format")
    return newest.sort(
      (a, b) =>
        collator.compare(formatLabel(a.request), formatLabel(b.request)) ||
        byTitle(a, b),
    );
  return newest.sort((a, b) =>
    order === "title" ? byTitle(a, b) : byTitle(b, a),
  );
}
export function cleanupMessage({ removed, recycled, failed }: Cleanup) {
  let text = `${plural(removed, "doublon")} retiré${removed > 1 ? "s" : ""} de l’historique`;
  if (recycled)
    text += `, ${plural(recycled, "fichier")} placé${recycled > 1 ? "s" : ""} dans la corbeille de Windows`;
  text += ".";
  if (failed)
    text += ` ${plural(failed, "élément")} non traité${failed > 1 ? "s sont conservés" : " est conservé"}.`;
  return text;
}
export const size = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
export function splitUrls(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\s+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}
export function validateUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      (u.port && u.port !== "443")
    )
      return "Utilisez un lien HTTPS public sans identifiants, fragment ou port personnalisé.";
    if (
      ![
        "youtube.com",
        "youtu.be",
        "vimeo.com",
        "wikimedia.org",
        "archive.org",
      ].some((d) => u.hostname === d || u.hostname.endsWith("." + d))
    )
      return "Source compatible attendue : YouTube, Vimeo, Wikimedia ou Archive.org.";
    return null;
  } catch {
    return "Ce lien ne semble pas valide. Collez son adresse HTTPS complète.";
  }
}
