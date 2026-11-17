import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  DownloadRequest,
  Media,
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
  analyze: (url: string) => call<Media>("analyze_media", { url }),
  enqueue: (request: DownloadRequest) =>
    call<Task>("enqueue_download", { request }),
  cancel: (id: string) => call<void>("cancel_download", { id }),
  retry: (id: string) => call<void>("retry_download", { id }),
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
