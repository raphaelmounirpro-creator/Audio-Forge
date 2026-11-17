import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  FileAudio2,
  Film,
  FolderOpen,
  History,
  House,
  Info,
  ListMusic,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type {
  DownloadRequest,
  ExistingFile,
  Media,
  MediaDetails,
  OutputOptions,
  Page,
  PlaylistEntry,
  Profile,
  Settings,
  Task,
  ToolInfo,
  ToolProgress,
  ToolSource,
} from "./types";
import { desktop, errorMessage, native } from "./services/native";
import {
  cleanupMessage,
  duration,
  formatLabel,
  outputKey,
  plural,
  size,
  sortOrders,
  sortTasks,
  splitUrls,
  statuses,
  terminal,
  validateUrl,
  type SortOrder,
} from "./utils";

const defaultSettings: Settings = {
  destination: "",
  audioFormat: "mp3",
  videoFormat: "mp4",
  mp3Bitrate: 192,
  concurrency: 2,
  metadata: true,
};
const navigation = [
  { id: "home", label: "Accueil", icon: House },
  { id: "downloads", label: "Téléchargements", icon: ArrowDownToLine },
  { id: "history", label: "Historique", icon: History },
  { id: "settings", label: "Paramètres", icon: Settings2 },
  { id: "about", label: "À propos", icon: Info },
] as const;
const audioFormats = [
  ["mp3", "MP3"],
  ["m4a", "M4A / AAC"],
  ["opus", "Opus"],
  ["flac", "FLAC"],
  ["wav", "WAV"],
  ["original", "Flux original"],
];
const videoFormats = [
  ["mp4", "MP4 compatible (H.264 / AAC)"],
  ["mkv", "MKV"],
  ["webm", "WebM"],
  ["original", "Original (MKV si fusion)"],
];

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sources, setSources] = useState<ToolSource[]>([]);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [loading, setLoading] = useState(desktop);
  const report = useCallback(
    (error: unknown) => setNotice({ text: errorMessage(error), error: true }),
    [],
  );
  const notify = useCallback(
    (text: string, error: boolean) => setNotice({ text, error }),
    [],
  );
  const refresh = useCallback(async () => {
    const result = await native.tasks();
    setTasks(result);
  }, []);
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void native
      .subscribe((task) => {
        if (alive)
          setTasks((old) => {
            const index = old.findIndex((t) => t.id === task.id);
            return index < 0
              ? [...old, task]
              : old.map((t) => (t.id === task.id ? task : t));
          });
      })
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(report);
    void Promise.all([
      native.tasks(),
      native.settings(),
      native.tools(),
      native.toolSources(),
    ])
      .then(([list, preferences, components, pinned]) => {
        if (alive) {
          setTasks(list);
          setSettings(preferences);
          setTools(components);
          setSources(pinned);
        }
      })
      .catch(report)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [report]);
  const active = tasks.filter((t) => !terminal(t.status)).length;
  const missingTools = tools.some((t) => !t.ready);
  function installed(list: ToolInfo[]) {
    setTools(list);
    if (list.every((t) => t.ready))
      setNotice({ text: "Composants installés et vérifiés.", error: false });
  }
  async function action(operation: () => Promise<unknown>) {
    try {
      await operation();
      await refresh();
    } catch (e) {
      report(e);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <AudioLines size={24} />
          </span>
          <span>
            AudioForge<small>Votre atelier multimédia</small>
          </span>
        </div>
        <nav aria-label="Navigation principale">
          {navigation.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              title={item.label}
              className={`nav-item ${page === item.id ? "selected" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => {
                setPage(item.id);
                setNotice(null);
              }}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "downloads" && active > 0 && (
                <span className="nav-count">{active}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={19} />
          <p>
            Gratuit. Local. Sans compte.
            <small>Vos fichiers restent chez vous.</small>
          </p>
        </div>
        <div className="version">
          AudioForge <span>v0.1.0 · Développement</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>{navigation.find((p) => p.id === page)?.label}</span>
          <span className="local-badge">
            <span className={`status-dot ${desktop ? "ready" : ""}`} />
            {desktop ? "Moteur local" : "Aperçu navigateur"}
          </span>
        </header>
        <main id="content" tabIndex={-1}>
          {!desktop && (
            <div className="preview-banner">
              <Info size={18} />
              <span>
                L’interface est en aperçu. L’analyse et les téléchargements
                nécessitent l’application Windows.
              </span>
            </div>
          )}
          {notice && (
            <div
              className={`notice ${notice.error ? "error" : "success"}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.error ? (
                <CircleAlert size={19} />
              ) : (
                <CheckCircle2 size={19} />
              )}
              <span>{notice.text}</span>
              <button
                className="icon-button"
                aria-label="Fermer le message"
                onClick={() => setNotice(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              <h1>Ouverture de votre atelier…</h1>
              <p>Lecture de la configuration locale.</p>
            </div>
          ) : (
            <>
              {page === "home" && missingTools && (
                <ToolSetup
                  sources={sources}
                  report={report}
                  onInstalled={installed}
                />
              )}
              {page === "home" && (
                <Home
                  settings={settings}
                  report={report}
                  onEnqueued={async (count, skipped) => {
                    await refresh();
                    const ignored = skipped
                      ? ` ${plural(skipped, "fichier existant ignoré", "fichiers existants ignorés")}.`
                      : "";
                    setNotice({
                      text: count
                        ? `${plural(count, "tâche ajoutée", "tâches ajoutées")} à la file.${ignored}`
                        : `Aucun média ajouté.${ignored}`,
                      error: false,
                    });
                    if (count) setPage("downloads");
                  }}
                />
              )}
              {(page === "downloads" || page === "history") && (
                <TaskList
                  key={page}
                  tasks={tasks}
                  history={page === "history"}
                  action={action}
                  notify={notify}
                />
              )}
              {page === "settings" && (
                <Preferences
                  initial={settings}
                  tools={tools}
                  sources={sources}
                  onInstalled={installed}
                  report={report}
                  onSave={async (value) => {
                    await native.saveSettings(value);
                    setSettings(value);
                    setNotice({
                      text: "Préférences enregistrées sur cet ordinateur.",
                      error: false,
                    });
                  }}
                  onTools={async () => setTools(await native.tools())}
                />
              )}
              {page === "about" && <About tools={tools} />}
            </>
          )}
        </main>
        <footer className="statusbar">
          <span>
            <ShieldCheck size={14} /> Aucun compte · Aucune télémétrie
          </span>
          <span>
            {desktop
              ? `${tools.filter((t) => t.ready).length}/4 composants vérifiés`
              : "Les commandes natives sont désactivées"}
          </span>
        </footer>
      </div>
    </div>
  );
}

function Home({
  settings,
  report,
  onEnqueued,
}: {
  settings: Settings;
  report: (e: unknown) => void;
  onEnqueued: (count: number, skipped: number) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<ExistingFile[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [kind, setKind] = useState<"audio" | "video">("audio");
  const [format, setFormat] = useState(settings.audioFormat);
  const [quality, setQuality] = useState(0);
  const [bitrate, setBitrate] = useState(settings.mp3Bitrate);
  const [destination, setDestination] = useState(settings.destination);
  const [metadata, setMetadata] = useState(settings.metadata);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profileSelection, setProfileSelection] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [inputError, setInputError] = useState("");
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    native
      .profiles()
      .then((items) => {
        if (active) setProfiles(items);
      })
      .catch((error: unknown) => {
        if (active) report(error);
      });
    return () => {
      active = false;
    };
  }, [report]);
  const entries = media.flatMap<PlaylistEntry & { details: MediaDetails }>(
    (m) => {
      const playlist = { id: m.url, title: m.title };
      return m.isPlaylist
        ? m.entries.map((entry) => ({
            ...entry,
            details: {
              creator: entry.creator,
              duration: entry.duration,
              playlist,
            },
          }))
        : [
            {
              id: m.id,
              url: m.url,
              title: m.title,
              duration: m.duration,
              mediaKey: m.mediaKey,
              details: { creator: m.creator, duration: m.duration },
            },
          ];
    },
  );
  const selectedKey = (entry: PlaylistEntry) => entry.mediaKey ?? entry.url;
  const entriesByKey = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const key = selectedKey(entry);
    if (!entriesByKey.has(key)) entriesByKey.set(key, entry);
  }
  const uniqueEntries = [...entriesByKey.values()];
  const resolutions = [
    ...new Set(
      media.flatMap((m) =>
        m.formats.flatMap((f) => (f.height ? [f.height] : [])),
      ),
    ),
  ]
    .filter((h) => [360, 480, 720, 1080, 1440, 2160].includes(h))
    .sort((a, b) => a - b);
  const outputOptions: OutputOptions = {
    kind,
    format,
    quality,
    bitrate,
    destination,
    metadata,
  };
  const output = outputKey(outputOptions);
  const builtInProfiles: Profile[] = [
    {
      name: "MP3 192 kb/s",
      output: {
        ...outputOptions,
        kind: "audio",
        format: "mp3",
        bitrate: 192,
        quality: 0,
      },
    },
    {
      name: "Audio original",
      output: {
        ...outputOptions,
        kind: "audio",
        format: "original",
        quality: 0,
      },
    },
    {
      name: "MP4 compatible 1080p",
      output: { ...outputOptions, kind: "video", format: "mp4", quality: 1080 },
    },
  ];
  function useProfile(value: string) {
    setProfileSelection(value);
    if (!value) return;
    const builtIn = value.startsWith("default:");
    const profile = builtIn
      ? builtInProfiles[Number(value.slice(8))]
      : profiles.find((p) => p.name === value.slice(5));
    if (!profile) return;
    const options = profile.output;
    setKind(options.kind);
    setFormat(options.format);
    setQuality(options.quality);
    setBitrate(options.bitrate);
    setDestination(options.destination);
    setMetadata(options.metadata);
    setProfileName(builtIn ? "" : profile.name);
    setConfirming(false);
  }
  async function saveProfile(remove = false) {
    setSavingProfile(true);
    try {
      if (remove) {
        setProfiles(await native.removeProfile(profileSelection.slice(5)));
        setProfileSelection("");
        setProfileName("");
      } else {
        const name = profileName.trim();
        setProfiles(await native.saveProfile({ name, output: outputOptions }));
        setProfileSelection(`user:${name}`);
      }
    } catch (error) {
      report(error);
    } finally {
      setSavingProfile(false);
    }
  }
  async function importLinks() {
    setAdding(true);
    try {
      const text = await native.importLinks();
      if (text === null) return;
      setInput(text);
      clearResults();
      const count = splitUrls(text).length;
      setInputError(
        count > 25
          ? "La liste contient plus de 25 liens. Analysez-la par groupes de 25."
          : count === 0
            ? "Cette liste TXT est vide."
            : "",
      );
    } catch (error) {
      report(error);
    } finally {
      setAdding(false);
    }
  }
  async function convertLocal() {
    setAdding(true);
    try {
      const task = await native.chooseLocalMedia(outputOptions);
      if (task) await onEnqueued(1, 0);
    } catch (error) {
      report(error);
    } finally {
      setAdding(false);
    }
  }
  const copiesOf = (url: string) => existing.filter((f) => f.url === url);
  const chosen = uniqueEntries.filter((e) => selected.has(selectedKey(e)));
  // Selected media whose file already exists in the chosen output format.
  const conflicts = chosen.filter((e) =>
    copiesOf(e.url).some((f) => outputKey(f.request) === output),
  );
  function clearResults() {
    setMedia([]);
    setSelected(new Set());
    setExisting([]);
    setConfirming(false);
  }
  async function analyze(e: FormEvent) {
    e.preventDefault();
    setInputError("");
    const urls = splitUrls(input);
    if (!urls.length) {
      setInputError("Collez au moins un lien à analyser.");
      return;
    }
    if (urls.length > 25) {
      setInputError("Analysez au maximum 25 liens à la fois.");
      return;
    }
    const invalid = urls.map(validateUrl).find(Boolean);
    if (invalid) {
      setInputError(invalid);
      return;
    }
    setBusy(true);
    clearResults();
    const result: Media[] = [];
    try {
      for (const [index, url] of urls.entries()) {
        setAnalysis(`Analyse du lien ${index + 1} sur ${urls.length}…`);
        try {
          const item = await native.analyze(url);
          result.push(item);
          setMedia([...result]);
        } catch (error) {
          report(error);
        }
      }
      const all = result.flatMap((m) =>
        m.isPlaylist ? m.entries.map((e) => e.url) : [m.url],
      );
      setSelected(
        new Set(
          result.flatMap((m) =>
            m.isPlaylist ? m.entries.map(selectedKey) : [m.mediaKey ?? m.url],
          ),
        ),
      );
      if (all.length) {
        setAnalysis("Recherche des fichiers déjà téléchargés…");
        try {
          setExisting(await native.existing(all));
        } catch (error) {
          report(error);
        }
      }
    } finally {
      setBusy(false);
      setAnalysis("");
    }
  }
  async function loadMore(playlist: Media) {
    if (busy || adding || !playlist.nextStart) return;
    setBusy(true);
    setConfirming(false);
    setAnalysis("Chargement de la suite de la playlist…");
    try {
      const page = await native.analyze(playlist.url, playlist.nextStart);
      if (!page.isPlaylist || page.id !== playlist.id) {
        throw new Error("La playlist a changé. Relancez son analyse.");
      }
      setMedia((previous) =>
        previous.map((item) =>
          item === playlist
            ? {
                ...item,
                entries: [...item.entries, ...page.entries],
                nextStart: page.nextStart,
              }
            : item,
        ),
      );
      if (page.entries.length) {
        const files = await native.existing(
          page.entries.map((entry) => entry.url),
        );
        setExisting((previous) => [...previous, ...files]);
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
      setAnalysis("");
    }
  }
  /** "ask" stops on existing files; "skip" leaves them out; "allow" saves them again. */
  async function enqueue(choice: "ask" | "skip" | "allow") {
    if (!destination.trim()) {
      report(
        new Error(
          "Choisissez un dossier de destination dans les options de sortie.",
        ),
      );
      return;
    }
    if (choice === "ask" && conflicts.length) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    const existingUrls = new Set(conflicts.map((e) => e.url));
    const items =
      choice === "skip"
        ? chosen.filter((e) => !existingUrls.has(e.url))
        : chosen;
    const skipped = chosen.length - items.length;
    setAdding(true);
    let count = 0;
    try {
      for (const item of items) {
        const request: DownloadRequest = {
          url: item.url,
          title: item.title,
          kind,
          format,
          quality,
          bitrate,
          destination,
          metadata,
        };
        try {
          await native.enqueue(
            request,
            existingUrls.has(item.url),
            item.details,
          );
          count++;
        } catch (error) {
          report(error);
        }
      }
      if (count || skipped) await onEnqueued(count, skipped);
    } finally {
      setAdding(false);
    }
  }
  return (
    <div className="home-page">
      <div className="page-heading">
        <h1>Un lien. Votre prochain fichier.</h1>
        <p>
          Téléchargez les contenus autorisés et choisissez le format qui vous
          convient.
        </p>
      </div>
      <form className="link-panel" onSubmit={analyze}>
        <label htmlFor="urls">Vos liens audio ou vidéo</label>
        <textarea
          id="urls"
          rows={3}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setInputError("");
            clearResults();
          }}
          placeholder="Collez un lien HTTPS, ou plusieurs liens sur des lignes séparées…"
          aria-describedby={inputError ? "url-error" : "url-help"}
          aria-invalid={!!inputError}
          disabled={busy || adding}
          spellCheck={false}
        />
        {inputError && (
          <p className="field-error" id="url-error" role="alert">
            {inputError}
          </p>
        )}
        <div className="link-panel-footer">
          <span id="url-help">YouTube, Vimeo, Wikimedia et Archive.org</span>
          {desktop && (
            <button
              type="button"
              className="secondary"
              disabled={busy || adding}
              onClick={() => void importLinks()}
            >
              Importer une liste TXT
            </button>
          )}
          <button
            className="primary"
            type="submit"
            disabled={busy || adding || !input.trim()}
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Search size={18} />
            )}
            {busy ? "Analyse en cours" : "Analyser les liens"}
            {!busy && <ArrowRight size={18} />}
          </button>
        </div>
        {busy && (
          <p className="analysis-status" role="status">
            {analysis}
          </p>
        )}
      </form>
      <section className="output-section" aria-labelledby="output-title">
        <div className="section-title">
          <h2 id="output-title">Options de sortie</h2>
          <span>Traitement sur cet ordinateur</span>
        </div>
        {desktop && (
          <div className="output-controls profile-controls">
            <label className="field">
              Profil de sortie
              <select
                value={profileSelection}
                onChange={(e) => useProfile(e.target.value)}
                disabled={adding || savingProfile}
              >
                <option value="">Réglages manuels</option>
                {builtInProfiles.map((profile, index) => (
                  <option key={profile.name} value={`default:${index}`}>
                    {profile.name}
                  </option>
                ))}
                {profiles.map((profile) => (
                  <option key={profile.name} value={`user:${profile.name}`}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Nom du profil
              <input
                value={profileName}
                maxLength={60}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!profileName.trim() || savingProfile || adding}
              onClick={() => void saveProfile()}
            >
              Enregistrer le profil
            </button>
            {profileSelection.startsWith("user:") && (
              <button
                type="button"
                className="text-button"
                disabled={savingProfile || adding}
                onClick={() => void saveProfile(true)}
              >
                Retirer le profil
              </button>
            )}
          </div>
        )}
        <div className="output-controls">
          <div className="field">
            <span id="kind-label">Type de média</span>
            <div
              className="segmented"
              role="group"
              aria-labelledby="kind-label"
            >
              <button
                type="button"
                aria-pressed={kind === "audio"}
                onClick={() => {
                  setKind("audio");
                  setFormat(settings.audioFormat);
                }}
              >
                <FileAudio2 size={17} />
                Audio
              </button>
              <button
                type="button"
                aria-pressed={kind === "video"}
                onClick={() => {
                  setKind("video");
                  setFormat(settings.videoFormat);
                }}
              >
                <Film size={17} />
                Vidéo
              </button>
            </div>
          </div>
          <label className="field">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {(kind === "audio" ? audioFormats : videoFormats).map(
                ([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ),
              )}
            </select>
          </label>
          {kind === "audio" ? (
            <label className="field">
              Débit MP3
              <select
                value={bitrate}
                disabled={format !== "mp3"}
                onChange={(e) => setBitrate(Number(e.target.value))}
              >
                {[128, 192, 256, 320].map((n) => (
                  <option key={n} value={n}>
                    {n} kb/s
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              Résolution maximale
              <select
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              >
                <option value={0}>Meilleure disponible</option>
                {resolutions.map((h) => (
                  <option key={h} value={h}>
                    {h}p
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="field destination">
          Dossier de destination
          <div className="folder-input">
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Sélectionnez votre dossier de téléchargement"
            />
            <button
              type="button"
              className="secondary"
              aria-label="Choisir un dossier de destination"
              onClick={() => {
                void native
                  .folder()
                  .then((p) => {
                    if (p) setDestination(p);
                  })
                  .catch(report);
              }}
            >
              <FolderOpen size={18} />
              <span>Parcourir</span>
            </button>
          </div>
        </label>
        <label className="hint">
          <input
            type="checkbox"
            checked={metadata}
            onChange={(e) => setMetadata(e.target.checked)}
          />
          Inscrire le titre en cas de conversion
        </label>
        {desktop && (
          <div className="link-panel-footer">
            <span>
              Conversion locale vers un format audio ou MP4 compatible
            </span>
            <button
              type="button"
              className="secondary"
              disabled={
                busy ||
                adding ||
                !destination.trim() ||
                format === "original" ||
                (kind === "video" && format !== "mp4")
              }
              onClick={() => void convertLocal()}
            >
              Convertir un fichier local
            </button>
          </div>
        )}
        <p className="hint">
          <Info size={15} />
          {kind === "audio"
            ? "La conversion ne peut pas améliorer la qualité de la source. FLAC et WAV occupent plus d’espace."
            : format === "mp4"
              ? "Le MP4 utilise H.264 et AAC. Les pistes incompatibles sont réencodées."
              : "Le conteneur est modifié sans réencodage. Certaines combinaisons de codecs et de conteneurs sont incompatibles."}
        </p>
      </section>
      {media.length > 0 ? (
        <section className="results" aria-labelledby="result-title">
          <div className="section-title">
            <h2 id="result-title">
              {uniqueEntries.length} média{uniqueEntries.length > 1 ? "s" : ""}{" "}
              accessible{uniqueEntries.length > 1 ? "s" : ""}
            </h2>
            <button
              className="text-button"
              onClick={() =>
                setSelected(
                  selected.size === uniqueEntries.length
                    ? new Set()
                    : new Set(uniqueEntries.map(selectedKey)),
                )
              }
            >
              {selected.size === uniqueEntries.length
                ? "Tout désélectionner"
                : "Tout sélectionner"}
            </button>
          </div>
          {media
            .filter((m) => m.isPlaylist)
            .map((m) => (
              <p className="playlist-name" key={m.url}>
                <ListMusic size={17} />
                {m.title} · {m.entries.length} éléments accessibles
                {m.nextStart && (
                  <button
                    className="text-button"
                    disabled={busy || adding}
                    onClick={() => void loadMore(m)}
                  >
                    Charger la suite (200 max.)
                  </button>
                )}
              </p>
            ))}
          <div className="media-list">
            {uniqueEntries.map((item) => (
              <label className="media-row" key={item.url}>
                <input
                  type="checkbox"
                  checked={selected.has(selectedKey(item))}
                  onChange={() =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (next.has(selectedKey(item)))
                        next.delete(selectedKey(item));
                      else next.add(selectedKey(item));
                      return next;
                    })
                  }
                />
                <div className="media-icon">
                  {kind === "audio" ? (
                    <FileAudio2 size={23} />
                  ) : (
                    <Film size={23} />
                  )}
                </div>
                <span className="media-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {new URL(item.url).hostname} · {duration(item.duration)}
                  </small>
                  <ExistingNote copies={copiesOf(item.url)} output={output} />
                </span>
              </label>
            ))}
          </div>
          {uniqueEntries.length === 0 && (
            <p>Aucun élément public compatible dans cette sélection.</p>
          )}
          {confirming && conflicts.length > 0 && (
            <div className="inline-confirm">
              <span role="alert">
                {conflicts.length === 1
                  ? `« ${conflicts[0].title} » a déjà été téléchargé dans ce format et le fichier existe toujours.`
                  : `${conflicts.length} médias sélectionnés ont déjà été téléchargés dans ce format et leurs fichiers existent toujours.`}{" "}
                Télécharger à nouveau crée une copie, sans écraser l’existant.
              </span>
              <button
                className="secondary"
                onClick={() => setConfirming(false)}
              >
                Annuler
              </button>
              {conflicts.length < chosen.length && (
                <button
                  className="secondary"
                  onClick={() => void enqueue("skip")}
                >
                  Ignorer les fichiers existants
                </button>
              )}
              <button className="primary" onClick={() => void enqueue("allow")}>
                Télécharger quand même
              </button>
            </div>
          )}
          <div className="result-footer">
            <span>
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <button
              className="primary"
              disabled={!selected.size || adding || busy}
              onClick={() => {
                void enqueue("ask");
              }}
            >
              {adding ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Plus size={18} />
              )}
              Ajouter aux téléchargements
            </button>
          </div>
        </section>
      ) : (
        !busy && (
          <section className="welcome-empty">
            <div className="empty-symbol">
              <AudioLines size={32} />
            </div>
            <div>
              <h2>Votre atelier est prêt.</h2>
              <p>
                Ajoutez un lien pour afficher son titre, ses formats et les
                éléments de sa playlist.
              </p>
            </div>
            <ChevronRight size={22} />
          </section>
        )
      )}
      <p className="rights-note">
        <ShieldCheck size={15} />
        Utilisez uniquement des contenus que vous avez le droit de télécharger.
        Les contenus privés et protégés par DRM sont exclus.
      </p>
    </div>
  );
}

function ExistingNote({
  copies,
  output,
}: {
  copies: ExistingFile[];
  output: string;
}) {
  if (!copies.length) return null;
  const same = copies.some((f) => outputKey(f.request) === output);
  const formats = [...new Set(copies.map((f) => formatLabel(f.request)))].join(
    ", ",
  );
  return (
    <small
      className={`existing-note ${same ? "same" : ""}`}
      title={copies.map((f) => f.path).join("\n")}
    >
      {same ? <CircleAlert size={13} /> : <Info size={13} />}
      {same
        ? `Fichier déjà présent dans ce format (${formats})`
        : `Déjà téléchargé en ${formats}`}
    </small>
  );
}

function TaskList({
  tasks,
  history,
  action,
  notify,
}: {
  tasks: Task[];
  history: boolean;
  action: (op: () => Promise<unknown>) => Promise<void>;
  notify: (text: string, error: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [order, setOrder] = useState<SortOrder>(history ? "newest" : "oldest");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());
  const [cleanup, setCleanup] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [retrySelection, setRetrySelection] = useState<Set<string>>(new Set());
  const [fileSizes, setFileSizes] = useState<Record<string, number | null>>({});
  const [fileRefresh, setFileRefresh] = useState(0);
  const completed = history
    ? tasks
        .filter((task) => task.status === "completed")
        .map((task) => task.id)
        .join(",")
    : "";
  useEffect(() => {
    if (!desktop || !completed) return;
    let active = true;
    async function readSizes() {
      const ids = completed.split(",");
      const next: Record<string, number | null> = {};
      for (let offset = 0; offset < ids.length && active; offset += 500) {
        Object.assign(
          next,
          await native.fileSizes(ids.slice(offset, offset + 500)),
        );
      }
      if (active) setFileSizes(next);
    }
    void readSizes().catch((error: unknown) => {
      if (active) notify(errorMessage(error), true);
    });
    return () => {
      active = false;
    };
  }, [completed, fileRefresh, notify]);
  // Recomputed by the engine only when finished entries change.
  const finished = tasks
    .filter((t) => terminal(t.status))
    .map((t) => t.id)
    .join();
  useEffect(() => {
    if (!history || !desktop) return;
    let alive = true;
    native
      .duplicates()
      .then((ids) => {
        if (alive) setDuplicates(new Set(ids));
      })
      .catch((error: unknown) => {
        if (alive) notify(errorMessage(error), true);
      });
    return () => {
      alive = false;
    };
  }, [history, finished, notify]);
  const list = sortTasks(
    tasks.filter(
      (t) =>
        (!history || terminal(t.status)) &&
        `${t.request.title} ${t.request.url} ${t.details?.creator ?? ""}`
          .toLocaleLowerCase("fr")
          .includes(search.toLocaleLowerCase("fr")) &&
        (filter === "all" ||
          (filter === "duplicates"
            ? duplicates.has(t.id)
            : t.status === filter)),
    ),
    order,
  );
  const duplicateFiles = tasks.some((t) => duplicates.has(t.id) && t.path);
  const selectedFailures = tasks.filter(
    (task) =>
      retrySelection.has(task.id) &&
      (task.status === "failed" || task.status === "interrupted"),
  );
  const playlistCounts = new Map<
    string,
    { title: string; total: number; completed: number; failed: number }
  >();
  if (!history) {
    for (const task of tasks) {
      const playlist = task.details?.playlist;
      if (!playlist) continue;
      const count = playlistCounts.get(playlist.id) ?? {
        title: playlist.title,
        total: 0,
        completed: 0,
        failed: 0,
      };
      count.total++;
      if (task.status === "completed") count.completed++;
      if (task.status === "failed" || task.status === "interrupted")
        count.failed++;
      playlistCounts.set(playlist.id, count);
    }
  }
  async function run(id: string, op: () => Promise<unknown>) {
    setPending(id);
    try {
      await action(op);
    } finally {
      setPending(null);
    }
  }
  function removeDuplicates() {
    setCleanup(false);
    void run("duplicates", async () => {
      const result = await native.removeDuplicates(deleteFiles);
      notify(cleanupMessage(result), result.failed > 0);
    });
    setDeleteFiles(false);
  }
  return (
    <div>
      <div className="page-heading">
        <h1>
          {history
            ? "Vos fichiers, à portée de main."
            : "Chaque téléchargement à sa place."}
        </h1>
        <p>
          {history
            ? "Retrouvez les tâches terminées et les fichiers enregistrés sur votre ordinateur."
            : "Suivez la progression, annulez une tâche ou relancez un téléchargement interrompu."}
        </p>
      </div>
      <div className="list-toolbar">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Rechercher une tâche"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un titre ou un lien…"
          />
        </div>
        <select
          aria-label="Filtrer les tâches par état"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tous les états</option>
          {Object.entries(statuses)
            .filter(([s]) => !history || terminal(s as Task["status"]))
            .map(([s, label]) => (
              <option value={s} key={s}>
                {label}
              </option>
            ))}
          {history && <option value="duplicates">Doublons</option>}
        </select>
        <select
          aria-label="Trier les tâches"
          value={order}
          onChange={(e) => setOrder(e.target.value as SortOrder)}
        >
          {Object.entries(sortOrders).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!history && desktop && selectedFailures.length > 0 && (
        <button
          className="secondary"
          disabled={pending !== null}
          onClick={() =>
            void run("retry-selected", async () => {
              const result = await native.retryFailed(
                selectedFailures.map((task) => task.id),
              );
              setRetrySelection(new Set());
              notify(
                `${result.restarted} relancée(s) · ${result.skipped} ignorée(s)`,
                result.skipped > 0,
              );
            })
          }
        >
          Relancer les tâches sélectionnées ({selectedFailures.length})
        </button>
      )}
      {!history && playlistCounts.size > 0 && (
        <section
          className="playlist-summary"
          aria-label="Progression par playlist"
        >
          {[...playlistCounts].map(([id, count]) => (
            <p className="playlist-name" key={id}>
              <ListMusic size={17} /> {count.title} · {count.completed}/
              {count.total} terminé(s)
              {count.failed > 0 && ` · ${count.failed} à relancer`}
            </p>
          ))}
        </section>
      )}
      {desktop && history && completed && (
        <button
          className="text-button"
          onClick={() => setFileRefresh((n) => n + 1)}
        >
          Actualiser l’état des fichiers
        </button>
      )}
      <div className="list-summary">
        <span>
          {plural(list.length, "tâche")}
          {!history &&
            ` · ${tasks.filter((t) => !terminal(t.status)).length} en cours ou en attente`}
        </span>
        {history && duplicates.size > 0 && (
          <button
            className="text-button"
            disabled={pending === "duplicates"}
            aria-expanded={cleanup}
            onClick={() => setCleanup((open) => !open)}
          >
            <Trash2 size={16} />
            Supprimer les doublons ({duplicates.size})
          </button>
        )}
      </div>
      {cleanup && duplicates.size > 0 && (
        <div className="inline-confirm cleanup-confirm">
          <span>
            Retirer {plural(duplicates.size, "doublon")} de l’historique ? Pour
            chaque média, format et dossier, l’entrée la plus récente dont le
            fichier existe est conservée.
            {duplicateFiles && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                />
                <span>
                  Mettre aussi leurs fichiers dans la corbeille de Windows
                  <small>
                    Les fichiers restent récupérables depuis la corbeille.
                    Windows demande confirmation si un disque n’en possède pas.
                  </small>
                </span>
              </label>
            )}
          </span>
          <button className="secondary" onClick={() => setCleanup(false)}>
            Garder
          </button>
          <button className="danger" onClick={removeDuplicates}>
            {deleteFiles && duplicateFiles
              ? "Retirer et mettre à la corbeille"
              : "Retirer les doublons"}
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-symbol">
            {history ? <History size={30} /> : <Download size={30} />}
          </div>
          <h2>
            {search || filter !== "all"
              ? "Aucune tâche ne correspond."
              : history
                ? "Votre historique commence ici."
                : "La file est libre."}
          </h2>
          <p>
            {search || filter !== "all"
              ? "Essayez un autre titre ou modifiez le filtre."
              : "Les médias ajoutés depuis l’accueil apparaîtront dans cette liste."}
          </p>
        </div>
      ) : (
        <div className="task-list">
          {list.map((task) => (
            <article className="task-row" key={task.id}>
              <div className="media-icon">
                {task.request.kind === "audio" ? (
                  <FileAudio2 size={23} />
                ) : (
                  <Film size={23} />
                )}
              </div>
              <div className="task-content">
                <div className="task-heading">
                  <h2>{task.request.title}</h2>
                  <span className={`task-status ${task.status}`}>
                    {task.status === "completed" ? (
                      <Check size={14} />
                    ) : task.status === "failed" ? (
                      <CircleAlert size={14} />
                    ) : (
                      <Clock3 size={14} />
                    )}
                    {statuses[task.status]}
                  </span>
                </div>
                <div className="task-meta">
                  {duplicates.has(task.id) && (
                    <span
                      className="tag"
                      title="Une autre entrée de ce média, dans ce format et ce dossier, est conservée."
                    >
                      Doublon
                    </span>
                  )}
                  <span>{formatLabel(task.request)}</span>
                  {task.localSource && <span>Conversion locale</span>}
                  {task.details?.playlist && (
                    <span>Playlist · {task.details.playlist.title}</span>
                  )}
                  {history && task.details?.creator && (
                    <span>{task.details.creator}</span>
                  )}
                  {history && task.details?.duration != null && (
                    <span>{duration(task.details.duration)}</span>
                  )}
                  {history &&
                    task.status === "completed" &&
                    fileSizes[task.id] !== undefined && (
                      <span>
                        {fileSizes[task.id] === null
                          ? "Fichier absent ou inaccessible"
                          : `Sur le disque · ${size(fileSizes[task.id] ?? 0)}`}
                      </span>
                    )}
                  <span>
                    {new Date(task.createdAt * 1000).toLocaleString("fr-FR")}
                  </span>
                  {task.speed !== null && (
                    <span>{(task.speed / 1024 / 1024).toFixed(1)} Mo/s</span>
                  )}
                  {task.eta !== null && <span>Reste {duration(task.eta)}</span>}
                </div>
                {!terminal(task.status) && (
                  <div className="progress-line">
                    <progress
                      aria-label={`Progression de ${task.request.title}`}
                      value={task.progress}
                      max={100}
                    />
                    <span>{Math.round(task.progress)} %</span>
                  </div>
                )}
                {task.path && <p className="file-path">{task.path}</p>}
                {task.error && <p className="task-error">{task.error}</p>}
                {task.errorCode === "ENGINE_ERROR" && (
                  <p className="hint">
                    Vérifiez le lien et les composants, puis relancez la tâche.
                  </p>
                )}
                {confirm === task.id && (
                  <div className="inline-confirm">
                    <span>
                      Retirer cette entrée ? Le fichier sera conservé.
                    </span>
                    <button
                      className="secondary"
                      onClick={() => setConfirm(null)}
                    >
                      Garder
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setConfirm(null);
                        void run(task.id, () => native.remove(task.id));
                      }}
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </div>
              <div className="task-actions">
                {!history &&
                  desktop &&
                  (task.status === "failed" ||
                    task.status === "interrupted") && (
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${task.request.title} pour relancer`}
                      checked={retrySelection.has(task.id)}
                      onChange={() =>
                        setRetrySelection((previous) => {
                          const next = new Set(previous);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        })
                      }
                    />
                  )}
                {task.status === "completed" && (
                  <>
                    <button
                      className="icon-button"
                      aria-label={`Ouvrir ${task.request.title}`}
                      title="Ouvrir le fichier"
                      onClick={() => {
                        void run(task.id, () => native.open(task.id));
                      }}
                    >
                      <ExternalLink size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Ouvrir le dossier de ${task.request.title}`}
                      title="Ouvrir le dossier"
                      onClick={() => {
                        void run(task.id, () => native.open(task.id, true));
                      }}
                    >
                      <FolderOpen size={18} />
                    </button>
                  </>
                )}
                {["failed", "cancelled", "interrupted"].includes(
                  task.status,
                ) && (
                  <button
                    className="icon-button"
                    disabled={pending === task.id}
                    aria-label={`Réessayer ${task.request.title}`}
                    title="Réessayer"
                    onClick={() => {
                      void run(task.id, () => native.retry(task.id));
                    }}
                  >
                    <RefreshCw size={18} />
                  </button>
                )}
                {!terminal(task.status) ? (
                  <button
                    className="icon-button"
                    disabled={pending === task.id}
                    aria-label={`Annuler ${task.request.title}`}
                    title="Annuler"
                    onClick={() => {
                      void run(task.id, () => native.cancel(task.id));
                    }}
                  >
                    <X size={18} />
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    aria-label={`Retirer ${task.request.title}`}
                    title="Retirer de la liste"
                    onClick={() => setConfirm(task.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Preferences({
  initial,
  tools,
  sources,
  onInstalled,
  report,
  onSave,
  onTools,
}: {
  initial: Settings;
  tools: ToolInfo[];
  sources: ToolSource[];
  onInstalled: (tools: ToolInfo[]) => void;
  report: (e: unknown) => void;
  onSave: (s: Settings) => Promise<void>;
  onTools: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const change = <K extends keyof Settings>(key: K, v: Settings[K]) =>
    setValue((old) => ({ ...old, [key]: v }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
    } catch (error) {
      report(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <div className="page-heading">
        <h1>Un atelier à votre façon.</h1>
        <p>Ces préférences sont enregistrées uniquement sur cet ordinateur.</p>
      </div>
      <form className="settings-form" onSubmit={save}>
        <section>
          <h2>Fichiers et formats</h2>
          <label className="field">
            Dossier par défaut
            <div className="folder-input">
              <input
                required
                value={value.destination}
                onChange={(e) => change("destination", e.target.value)}
                placeholder="Choisir un dossier local"
              />
              <button
                className="secondary"
                type="button"
                aria-label="Parcourir les dossiers"
                onClick={() => {
                  void native
                    .folder()
                    .then((p) => {
                      if (p) change("destination", p);
                    })
                    .catch(report);
                }}
              >
                <FolderOpen size={18} />
              </button>
            </div>
          </label>
          <div className="settings-grid">
            <label className="field">
              Format audio
              <select
                value={value.audioFormat}
                onChange={(e) => change("audioFormat", e.target.value)}
              >
                {audioFormats.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Format vidéo
              <select
                value={value.videoFormat}
                onChange={(e) => change("videoFormat", e.target.value)}
              >
                {videoFormats.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Débit MP3
              <select
                value={value.mp3Bitrate}
                onChange={(e) => change("mp3Bitrate", Number(e.target.value))}
              >
                {[128, 192, 256, 320].map((n) => (
                  <option key={n} value={n}>
                    {n} kb/s
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Téléchargements simultanés
              <select
                value={value.concurrency}
                onChange={(e) => change("concurrency", Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === 2 ? " (recommandé)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={value.metadata}
              onChange={(e) => change("metadata", e.target.checked)}
            />
            <span>
              Ajouter le titre aux métadonnées du fichier converti
              <small>
                Les métadonnées complètes et pochettes seront ajoutées dans une
                prochaine étape.
              </small>
            </span>
          </label>
        </section>
        <div className="save-row">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Check size={18} />
            )}
            Enregistrer les préférences
          </button>
        </div>
      </form>
      <section className="components-section">
        <div className="section-title">
          <h2>Composants multimédias</h2>
          <button
            className="text-button"
            disabled={checking || !desktop}
            onClick={() => {
              setChecking(true);
              void onTools()
                .catch(report)
                .finally(() => setChecking(false));
            }}
          >
            <RefreshCw size={16} className={checking ? "spin" : ""} />
            Vérifier l’intégrité
          </button>
        </div>
        <ToolList tools={tools} />
        {tools.some((t) => !t.ready) ? (
          <ToolSetup
            sources={sources}
            report={report}
            onInstalled={onInstalled}
          />
        ) : (
          <p className="hint">
            Téléchargés depuis leurs distributeurs officiels et vérifiés par
            SHA-256 à chaque utilisation. Aucune mise à jour silencieuse.
          </p>
        )}
      </section>
    </div>
  );
}
const stageLabels: Record<ToolProgress["stage"], string> = {
  download: "Téléchargement",
  verify: "Vérification de l’empreinte",
  extract: "Extraction",
  ready: "Vérifié",
};
function ToolSetup({
  sources,
  report,
  onInstalled,
}: {
  sources: ToolSource[];
  report: (e: unknown) => void;
  onInstalled: (tools: ToolInfo[]) => void;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, ToolProgress>>({});
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    let stop: (() => void) | undefined;
    void native
      .subscribeTools((step) => {
        if (alive) setProgress((old) => ({ ...old, [step.repository]: step }));
      })
      .then((unlisten) => {
        if (alive) stop = unlisten;
        else unlisten();
      })
      .catch(report);
    return () => {
      alive = false;
      stop?.();
    };
  }, [report]);
  async function install() {
    setRunning(true);
    setProgress({});
    try {
      onInstalled(await native.installTools());
    } catch (error) {
      report(error);
    } finally {
      setRunning(false);
    }
  }
  const total = sources.reduce((sum, s) => sum + s.size, 0);
  return (
    <section className="tool-setup" aria-labelledby="tool-setup-title">
      <h2 id="tool-setup-title">Installer les composants multimédias</h2>
      <p>
        AudioForge s’appuie sur des logiciels libres pour analyser, télécharger
        et convertir. Ils ne sont pas inclus dans l’installateur : AudioForge
        les télécharge depuis leurs distributeurs officiels, vérifie leur
        empreinte SHA-256, puis les enregistre dans votre profil Windows.
      </p>
      <ul className="source-list">
        {sources.map((s) => {
          const step = progress[s.repository];
          const name = s.files.map((f) => f.replace(/\.exe$/, "")).join(" et ");
          return (
            <li key={s.repository}>
              <strong>{name}</strong>
              <span>
                {s.version} · {new URL(s.url).hostname} · {size(s.size)} ·
                licence {s.license}
              </span>
              {step && (
                <div className="progress-line">
                  <progress
                    aria-label={`Progression de ${name}`}
                    value={step.stage === "download" ? step.received : 1}
                    max={step.stage === "download" ? step.total : 1}
                  />
                  <span>
                    {step.stage === "download"
                      ? `${stageLabels.download} ${Math.floor((step.received / step.total) * 100)} %`
                      : stageLabels[step.stage]}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint">
        {size(total)} au total. Ces sites reçoivent votre adresse IP, comme pour
        tout téléchargement. Rien n’est installé si une empreinte diffère, et
        aucune mise à jour n’est faite sans votre accord.
      </p>
      <div className="tool-setup-actions">
        <button
          className="primary"
          disabled={running}
          onClick={() => void install()}
        >
          {running ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Download size={18} />
          )}
          {running ? "Installation en cours…" : "Télécharger et vérifier"}
        </button>
        {running && (
          <button
            className="secondary"
            onClick={() => void native.cancelToolsInstall().catch(report)}
          >
            Annuler l’installation
          </button>
        )}
      </div>
    </section>
  );
}
function ToolList({ tools }: { tools: ToolInfo[] }) {
  return (
    <div className="tool-list">
      {(tools.length
        ? tools
        : ["yt-dlp", "ffmpeg", "ffprobe", "deno"].map((name) => ({
            name,
            version: "Non vérifié",
            ready: false,
            detail: "Disponible dans l’application Windows",
          }))
      ).map((tool) => (
        <div className="tool-row" key={tool.name}>
          <span className={`status-dot ${tool.ready ? "ready" : ""}`} />
          <strong>{tool.name}</strong>
          <span>{tool.version}</span>
          <small>{tool.detail}</small>
        </div>
      ))}
    </div>
  );
}
function About({ tools }: { tools: ToolInfo[] }) {
  return (
    <div className="about-page">
      <div className="about-logo">
        <AudioLines size={40} />
      </div>
      <h1>AudioForge</h1>
      <p className="about-subtitle">
        Votre atelier multimédia, sur votre ordinateur.
      </p>
      <span className="version-label">Version 0.1.0 · En développement</span>
      <section>
        <h2>Gratuit, sans contrepartie.</h2>
        <p>
          Aucun abonnement, aucune publicité, aucun compte et aucune télémétrie.
          L’historique et les préférences sont conservés localement. Les
          plateformes sources reçoivent les connexions nécessaires à l’analyse
          et au téléchargement.
        </p>
      </section>
      <section>
        <h2>Des formats, en toute transparence.</h2>
        <p>
          AudioForge s’appuie sur yt-dlp, FFmpeg, ffprobe et Deno. Une
          conversion en MP3 320 kb/s ou FLAC n’améliore pas une source déjà
          compressée. Les restrictions des plateformes restent applicables.
        </p>
      </section>
      <section>
        <h2>Composants et licences</h2>
        <ToolList tools={tools} />
        <p>
          Le code AudioForge est sous licence MIT. Les licences des
          bibliothèques intégrées sont installées avec l’application, dans
          notices/THIRD_PARTY_NOTICES.txt. yt-dlp, FFmpeg et Deno ne sont pas
          inclus dans l’installateur : ils sont téléchargés à votre demande
          depuis leurs distributeurs officiels et restent soumis à leurs propres
          licences.
        </p>
      </section>
      <section>
        <h2>Utilisation autorisée</h2>
        <p>
          Téléchargez uniquement les contenus dont vous détenez les droits ou
          pour lesquels vous disposez d’une autorisation. Aucun contournement
          DRM, accès privé ou stockage d’identifiants n’est prévu.
        </p>
      </section>
    </div>
  );
}
