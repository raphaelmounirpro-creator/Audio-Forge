import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Cleanup,
  DownloadRequest,
  ExistingFile,
  Media,
  MediaDetails,
  OutputOptions,
  Profile,
  Settings,
  Task,
  ToolInfo,
  ToolProgress,
  ToolSource,
} from "../types";

export const desktop = isTauri();
export function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return typeof error === "string"
    ? error
    : "Une erreur est survenue. Réessayez ou vérifiez les composants dans les paramètres.";
}
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!desktop)
    return Promise.reject(
      new Error("Ouvrez l'application Windows pour utiliser le moteur local."),
    );
  return invoke<T>(command, args);
}
export const native = {
  tasks: () => call<Task[]>("get_tasks"),
  settings: () => call<Settings>("get_settings"),
  tools: () => call<ToolInfo[]>("get_tools"),
  toolSources: () => call<ToolSource[]>("get_tool_sources"),
  installTools: () => call<ToolInfo[]>("install_tools"),
  cancelToolsInstall: () => call<void>("cancel_tools_install"),
  subscribeTools: (callback: (progress: ToolProgress) => void) =>
    listen<ToolProgress>("tools-progress", (event) => callback(event.payload)),
  saveSettings: (settings: Settings) =>
    call<void>("save_settings", { settings }),
  analyze: (url: string, start?: number) =>
    call<Media>("analyze_media", { url, start }),
  /** `allowExisting`: the user confirmed saving again a file already on disk. */
  enqueue: (
    request: DownloadRequest,
    allowExisting = false,
    details?: MediaDetails,
  ) => call<Task>("enqueue_download", { request, allowExisting, details }),
  profiles: () => call<Profile[]>("get_profiles"),
  saveProfile: (profile: Profile) =>
    call<Profile[]>("save_profile", { profile }),
  removeProfile: (name: string) => call<Profile[]>("remove_profile", { name }),
  chooseLocalMedia: (output: OutputOptions) =>
    call<Task | null>("choose_local_media", { output }),
  importLinks: () => call<string | null>("import_link_list"),
  fileSizes: (ids: string[]) =>
    call<Record<string, number | null>>("get_file_sizes", { ids }),
  existing: (urls: string[]) => call<ExistingFile[]>("find_existing", { urls }),
  duplicates: () => call<string[]>("find_duplicates"),
  removeDuplicates: (deleteFiles: boolean) =>
    call<Cleanup>("remove_duplicates", { deleteFiles }),
  cancel: (id: string) => call<void>("cancel_download", { id }),
  retry: (id: string) => call<void>("retry_download", { id }),
  retryFailed: (ids: string[]) =>
    call<{ restarted: number; skipped: number }>("retry_failed_downloads", {
      ids,
    }),
  remove: (id: string) => call<void>("remove_download", { id }),
  open: (id: string, folder = false) =>
    call<void>("open_download", { id, folder }),
  subscribe: (callback: (task: Task) => void) =>
    listen<Task>("task-updated", (event) => callback(event.payload)),
  async folder(): Promise<string | null> {
    if (!desktop)
      throw new Error(
        "Le sélecteur de dossier est disponible dans l'application Windows.",
      );
    const path = await open({
      directory: true,
      multiple: false,
      title: "Choisir le dossier de destination",
    });
    return typeof path === "string" ? path : null;
  },
};
