import type { Status } from "./types";

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
