import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Media,
  Settings,
  Task,
  ToolInfo,
  ToolProgress,
  ToolSource,
} from "./types";

const mock = vi.hoisted(() => ({
  tasks: vi.fn(),
  settings: vi.fn(),
  tools: vi.fn(),
  toolSources: vi.fn(),
  installTools: vi.fn(),
  cancelToolsInstall: vi.fn(),
  subscribeTools: vi.fn(),
  subscribe: vi.fn(),
  analyze: vi.fn(),
  enqueue: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  remove: vi.fn(),
  open: vi.fn(),
  folder: vi.fn(),
  saveSettings: vi.fn(),
}));
vi.mock("./services/native", () => ({
  desktop: true,
  native: mock,
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
import { App } from "./App";
const settings: Settings = {
  destination: "C:\\Downloads",
  audioFormat: "mp3",
  videoFormat: "mp4",
  mp3Bitrate: 192,
  concurrency: 2,
  metadata: true,
};
const media: Media = {
  id: "one",
  url: "https://vimeo.com/123",
  title: "Enregistrement autorisé",
  creator: "Auteur",
  duration: 61,
  formats: [
    { id: "audio", ext: "m4a", height: null, audio: true, video: false },
  ],
  entries: [],
  isPlaylist: false,
};
function task(status: Task["status"]): Task {
  return {
    id: "one",
    request: {
      url: media.url,
      title: media.title,
      kind: "audio",
      format: "mp3",
      quality: 0,
      bitrate: 192,
      destination: settings.destination,
      metadata: true,
    },
    status,
    progress: 35,
    speed: 1024 * 1024,
    eta: 30,
    path: status === "completed" ? "C:\\Downloads\\test.mp3" : null,
    error: null,
    createdAt: 1700000000,
  };
}
const sources: ToolSource[] = [
  {
    repository: "yt-dlp/yt-dlp",
    version: "2026.10.26",
    url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe",
    sha256: "a".repeat(64),
    size: 23575744,
    license: "GPL-3.0-or-later",
    files: ["yt-dlp.exe"],
  },
  {
    repository: "GyanD/codexffmpeg",
    version: "9.0.2",
    url: "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip",
    sha256: "b".repeat(64),
    size: 114768076,
    license: "GPL-3.0-or-later",
    files: ["ffmpeg.exe", "ffprobe.exe"],
  },
];
const tool = (name: string, ready: boolean): ToolInfo => ({
  name,
  version: "1",
  ready,
  detail: ready ? "Intégrité SHA-256 vérifiée" : "Non installé",
});
const setupPanel = () =>
  screen.findByRole("region", { name: "Installer les composants multimédias" });
beforeEach(() => {
  vi.resetAllMocks();
  mock.tasks.mockResolvedValue([]);
  mock.settings.mockResolvedValue(settings);
  mock.tools.mockResolvedValue([]);
  mock.toolSources.mockResolvedValue(sources);
  mock.subscribeTools.mockResolvedValue(() => {});
  mock.subscribe.mockResolvedValue(() => {});
  mock.analyze.mockResolvedValue(media);
  mock.enqueue.mockResolvedValue(task("queued"));
  mock.saveSettings.mockResolvedValue(undefined);
});
describe("parcours natifs avec IPC simulé", () => {
  it("analyse puis transmet une tâche typée avec les options choisies", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.type(
      screen.getByLabelText("Vos liens audio ou vidéo"),
      media.url,
    );
    await user.click(
      screen.getByRole("button", { name: "Analyser les liens" }),
    );
    await screen.findByText(media.title);
    await user.selectOptions(screen.getByLabelText("Format"), "flac");
    await user.click(
      screen.getByRole("button", { name: "Ajouter aux téléchargements" }),
    );
    await waitFor(() =>
      expect(mock.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          url: media.url,
          format: "flac",
          kind: "audio",
          destination: settings.destination,
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 tâche ajoutée",
    );
  });
  it("respecte la désélection dans une playlist", async () => {
    mock.analyze.mockResolvedValue({
      ...media,
      isPlaylist: true,
      entries: [
        { id: "a", url: "https://vimeo.com/1", title: "Premier", duration: 10 },
        { id: "b", url: "https://vimeo.com/2", title: "Second", duration: 20 },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.type(
      screen.getByLabelText("Vos liens audio ou vidéo"),
      media.url,
    );
    await user.click(
      screen.getByRole("button", { name: "Analyser les liens" }),
    );
    await screen.findByText("Premier");
    await user.click(screen.getByRole("checkbox", { name: /Second/ }));
    await user.click(
      screen.getByRole("button", { name: "Ajouter aux téléchargements" }),
    );
    await waitFor(() => expect(mock.enqueue).toHaveBeenCalledTimes(1));
    expect(mock.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://vimeo.com/1" }),
    );
  });
  it("annule une tâche réelle via la commande dédiée", async () => {
    mock.tasks.mockResolvedValue([task("downloading")]);
    mock.cancel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.click(screen.getByRole("button", { name: "Téléchargements" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "35");
    await user.click(
      screen.getByRole("button", { name: `Annuler ${media.title}` }),
    );
    await waitFor(() => expect(mock.cancel).toHaveBeenCalledWith("one"));
  });
  it("confirme le retrait d’historique et ne demande jamais la suppression du fichier", async () => {
    mock.tasks.mockResolvedValue([task("completed")]);
    mock.remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.click(screen.getByRole("button", { name: "Historique" }));
    await user.click(
      screen.getByRole("button", { name: `Retirer ${media.title}` }),
    );
    expect(mock.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/Le fichier sera conservé/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(mock.remove).toHaveBeenCalledWith("one"));
  });
  it("ne télécharge les composants qu’après accord explicite et suit la progression", async () => {
    mock.tools.mockResolvedValue([
      tool("yt-dlp", false),
      tool("ffmpeg", false),
    ]);
    let emit: (step: ToolProgress) => void = () => {};
    mock.subscribeTools.mockImplementation(
      async (callback: (step: ToolProgress) => void) => {
        emit = callback;
        return () => {};
      },
    );
    let finish: (list: ToolInfo[]) => void = () => {};
    mock.installTools.mockReturnValue(
      new Promise<ToolInfo[]>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    const panel = await setupPanel();
    expect(mock.installTools).not.toHaveBeenCalled();
    expect(panel).toHaveTextContent("www.gyan.dev");
    expect(panel).toHaveTextContent("109,5 Mo");
    expect(panel).toHaveTextContent("131,9 Mo au total");
    await user.click(
      within(panel).getByRole("button", { name: "Télécharger et vérifier" }),
    );
    expect(mock.installTools).toHaveBeenCalledTimes(1);
    expect(
      within(panel).getByRole("button", { name: "Installation en cours…" }),
    ).toBeDisabled();
    act(() =>
      emit({
        repository: "GyanD/codexffmpeg",
        stage: "download",
        received: 57384038,
        total: 114768076,
      }),
    );
    expect(within(panel).getByText("Téléchargement 50 %")).toBeVisible();
    await act(async () => finish([tool("yt-dlp", true), tool("ffmpeg", true)]));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Composants installés et vérifiés.",
    );
    expect(
      screen.queryByRole("region", {
        name: "Installer les composants multimédias",
      }),
    ).not.toBeInTheDocument();
  });
  it("transmet l’annulation de l’installation et affiche l’échec", async () => {
    mock.tools.mockResolvedValue([tool("deno", false)]);
    let fail: (error: Error) => void = () => {};
    mock.installTools.mockReturnValue(
      new Promise<ToolInfo[]>((_, reject) => {
        fail = reject;
      }),
    );
    mock.cancelToolsInstall.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    const panel = await setupPanel();
    await user.click(
      within(panel).getByRole("button", { name: "Télécharger et vérifier" }),
    );
    await user.click(
      within(panel).getByRole("button", { name: "Annuler l’installation" }),
    );
    expect(mock.cancelToolsInstall).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("Téléchargement annulé.")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Téléchargement annulé.",
    );
    expect(
      within(panel).getByRole("button", { name: "Télécharger et vérifier" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Composants installés et vérifiés."),
    ).not.toBeInTheDocument();
  });
  it("affiche un échec de sauvegarde sans annoncer de réussite", async () => {
    mock.saveSettings.mockRejectedValue(new Error("Disque inaccessible"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.click(screen.getByRole("button", { name: "Paramètres" }));
    await user.click(
      screen.getByRole("button", { name: "Enregistrer les préférences" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Disque inaccessible",
    );
    expect(
      screen.queryByText("Préférences enregistrées sur cet ordinateur."),
    ).not.toBeInTheDocument();
  });
});
