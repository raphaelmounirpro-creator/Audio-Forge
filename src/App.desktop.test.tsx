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
  profiles: vi.fn(),
  saveProfile: vi.fn(),
  fileSizes: vi.fn(),
  retryFailed: vi.fn(),
  importLinks: vi.fn(),
  chooseLocalMedia: vi.fn(),
  existing: vi.fn(),
  duplicates: vi.fn(),
  removeDuplicates: vi.fn(),
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
  mock.profiles.mockResolvedValue([]);
  mock.fileSizes.mockResolvedValue({});
  mock.existing.mockResolvedValue([]);
  mock.duplicates.mockResolvedValue([]);
  mock.saveSettings.mockResolvedValue(undefined);
});
async function analyzeLink(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText("Vos liens audio ou vidéo");
  await user.type(screen.getByLabelText("Vos liens audio ou vidéo"), media.url);
  await user.click(screen.getByRole("button", { name: "Analyser les liens" }));
}
describe("parcours natifs avec IPC simulé", () => {
  it("enregistre un profil appliqué et transmet ses options à la conversion locale", async () => {
    const user = userEvent.setup();
    mock.saveProfile.mockImplementation(async (profile: unknown) => [profile]);
    mock.chooseLocalMedia.mockResolvedValue(task("queued"));
    render(<App />);
    await user.selectOptions(
      await screen.findByLabelText("Profil de sortie"),
      "default:2",
    );
    await user.type(screen.getByLabelText("Nom du profil"), "Archives");
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le profil" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Profil de sortie")).toHaveValue(
        "user:Archives",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Convertir un fichier local" }),
    );
    expect(mock.chooseLocalMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        format: "mp4",
        quality: 1080,
        destination: settings.destination,
      }),
    );
  });

  it("place une liste TXT dans le formulaire sans lancer d’analyse", async () => {
    const user = userEvent.setup();
    mock.importLinks.mockResolvedValue(
      "https://vimeo.com/1\nhttps://vimeo.com/2",
    );
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Importer une liste TXT" }),
    );
    expect(screen.getByLabelText("Vos liens audio ou vidéo")).toHaveValue(
      "https://vimeo.com/1\nhttps://vimeo.com/2",
    );
    expect(mock.analyze).not.toHaveBeenCalled();
  });

  it("relance les erreurs sélectionnées dans la file", async () => {
    const user = userEvent.setup();
    mock.tasks.mockResolvedValue([
      task("failed"),
      {
        ...task("interrupted"),
        id: "two",
        request: { ...task("interrupted").request, title: "Second média" },
      },
    ]);
    mock.retryFailed.mockResolvedValue({ restarted: 2, skipped: 0 });
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Téléchargements" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Sélectionner Enregistrement/ }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Sélectionner Second/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Relancer les tâches sélectionnées/ }),
    );
    expect(mock.retryFailed).toHaveBeenCalledWith(["one", "two"]);
  });

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
        false,
        { creator: media.creator, duration: media.duration },
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
      false,
      expect.objectContaining({
        playlist: { id: media.url, title: media.title },
      }),
    );
  });
  it("charge la suite sans resélectionner un média écarté ni dupliquer un alias", async () => {
    mock.analyze
      .mockResolvedValueOnce({
        ...media,
        isPlaylist: true,
        nextStart: 201,
        entries: [
          {
            id: "a",
            mediaKey: "vimeo:a",
            url: "https://vimeo.com/1",
            title: "Premier",
            duration: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        ...media,
        isPlaylist: true,
        entries: [
          {
            id: "a",
            mediaKey: "vimeo:a",
            url: "https://vimeo.com/1?alias=yes",
            title: "Alias",
            duration: 10,
          },
          {
            id: "b",
            mediaKey: "vimeo:b",
            url: "https://vimeo.com/2",
            title: "Second",
            duration: 20,
          },
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
    await user.click(await screen.findByRole("checkbox", { name: /Premier/ }));
    await user.click(screen.getByRole("button", { name: /Charger la suite/ }));
    await screen.findByText("Second");
    expect(mock.analyze).toHaveBeenLastCalledWith(media.url, 201);
    expect(
      screen.getAllByRole("checkbox", { name: /Alias|Premier|Second/ }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("checkbox", { name: /Alias|Premier/ }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Second/ })).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: /Charger la suite/ }),
    ).not.toBeInTheDocument();
  });
  it("prévient qu’un fichier existe déjà et attend un choix explicite", async () => {
    const existing = {
      url: media.url,
      request: task("completed").request,
      path: "C:\\Downloads\\Enregistrement autorisé [one].mp3",
    };
    mock.existing.mockResolvedValue([existing]);
    const user = userEvent.setup();
    render(<App />);
    await analyzeLink(user);
    expect(
      await screen.findByText(
        "Fichier déjà présent dans ce format (MP3 192 kb/s)",
      ),
    ).toBeVisible();
    expect(mock.existing).toHaveBeenCalledWith([media.url]);
    await user.click(
      screen.getByRole("button", { name: "Ajouter aux téléchargements" }),
    );
    expect(mock.enqueue).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "a déjà été téléchargé dans ce format",
    );
    // Seul média sélectionné : l’ignorer n’ajouterait rien.
    expect(
      screen.queryByRole("button", { name: "Ignorer les fichiers existants" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Un autre format n’est pas un doublon : simple mention, pas de blocage.
    await user.selectOptions(screen.getByLabelText("Format"), "flac");
    expect(screen.getByText("Déjà téléchargé en MP3 192 kb/s")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Format"), "mp3");
    await user.click(
      screen.getByRole("button", { name: "Ajouter aux téléchargements" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Télécharger quand même" }),
    );
    await waitFor(() =>
      expect(mock.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ url: media.url, format: "mp3" }),
        true,
        { creator: media.creator, duration: media.duration },
      ),
    );
  });
  it("ignore les fichiers existants d’une sélection sur demande", async () => {
    mock.analyze.mockResolvedValue({
      ...media,
      isPlaylist: true,
      entries: [
        { id: "a", url: "https://vimeo.com/1", title: "Premier", duration: 10 },
        { id: "b", url: "https://vimeo.com/2", title: "Second", duration: 20 },
      ],
    });
    mock.existing.mockResolvedValue([
      {
        url: "https://vimeo.com/1",
        request: { ...task("completed").request, url: "https://vimeo.com/1" },
        path: "C:\\Downloads\\Premier [aaaa].mp3",
      },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await analyzeLink(user);
    await screen.findByText(
      "Fichier déjà présent dans ce format (MP3 192 kb/s)",
    );
    await user.click(
      screen.getByRole("button", { name: "Ajouter aux téléchargements" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Ignorer les fichiers existants" }),
    );
    await waitFor(() => expect(mock.enqueue).toHaveBeenCalledTimes(1));
    expect(mock.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://vimeo.com/2" }),
      false,
      expect.objectContaining({
        playlist: { id: media.url, title: media.title },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 tâche ajoutée à la file. 1 fichier existant ignoré.",
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
  it("signale les doublons et ne touche aux fichiers qu’avec l’option cochée", async () => {
    const kept = task("completed");
    const copy = { ...task("completed"), id: "two", createdAt: 1600000000 };
    mock.tasks.mockResolvedValue([kept, copy]);
    mock.duplicates.mockResolvedValue(["two"]);
    mock.removeDuplicates.mockResolvedValue({
      removed: 1,
      recycled: 1,
      failed: 0,
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.click(screen.getByRole("button", { name: "Historique" }));
    expect(await screen.findByText("Doublon")).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Filtrer les tâches par état"),
      "duplicates",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Supprimer les doublons (1)" }),
    );
    expect(mock.removeDuplicates).not.toHaveBeenCalled();
    expect(screen.getByText(/Retirer 1 doublon de l’historique/)).toBeVisible();
    const trash = screen.getByRole("checkbox", {
      name: /corbeille de Windows/,
    });
    expect(trash).not.toBeChecked();
    await user.click(trash);
    await user.click(
      screen.getByRole("button", { name: "Retirer et mettre à la corbeille" }),
    );
    await waitFor(() =>
      expect(mock.removeDuplicates).toHaveBeenCalledWith(true),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 doublon retiré de l’historique, 1 fichier placé dans la corbeille de Windows.",
    );
  });
  it("trie l’historique par titre ou par date", async () => {
    const titled = (id: string, title: string, createdAt: number): Task => ({
      ...task("completed"),
      id,
      createdAt,
      request: { ...task("completed").request, title },
    });
    mock.tasks.mockResolvedValue([
      titled("b", "Écho", 2),
      titled("a", "abeille", 1),
      titled("c", "Zèbre", 3),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText("Vos liens audio ou vidéo");
    await user.click(screen.getByRole("button", { name: "Historique" }));
    const titles = () =>
      screen
        .getAllByRole("article")
        .map((row) => within(row).getByRole("heading").textContent);
    expect(titles()).toEqual(["Zèbre", "Écho", "abeille"]);
    await user.selectOptions(
      screen.getByLabelText("Trier les tâches"),
      "title",
    );
    expect(titles()).toEqual(["abeille", "Écho", "Zèbre"]);
    await user.selectOptions(
      screen.getByLabelText("Trier les tâches"),
      "oldest",
    );
    expect(titles()).toEqual(["abeille", "Écho", "Zèbre"]);
    await user.selectOptions(
      screen.getByLabelText("Trier les tâches"),
      "title-desc",
    );
    expect(titles()).toEqual(["Zèbre", "Écho", "abeille"]);
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
