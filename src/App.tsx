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
  Media,
  Page,
  Settings,
  Task,
  ToolInfo,
} from "./types";
import { desktop, errorMessage, native } from "./services/native";
import { duration, splitUrls, statuses, terminal, validateUrl } from "./utils";

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
  ["mp4", "MP4"],
  ["mkv", "MKV"],
  ["webm", "WebM"],
  ["original", "Original (MKV si fusion)"],
];

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [loading, setLoading] = useState(desktop);
  const report = useCallback(
    (error: unknown) => setNotice({ text: errorMessage(error), error: true }),
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
    void Promise.all([native.tasks(), native.settings(), native.tools()])
      .then(([list, preferences, components]) => {
        if (alive) {
          setTasks(list);
          setSettings(preferences);
          setTools(components);
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
              {page === "home" && (
                <Home
                  settings={settings}
                  report={report}
                  onEnqueued={async (count) => {
                    await refresh();
                    setNotice({
                      text: `${count} tâche${count > 1 ? "s ajoutées" : " ajoutée"} à la file.`,
                      error: false,
                    });
                    setPage("downloads");
                  }}
                />
              )}
              {page === "downloads" && (
                <TaskList tasks={tasks} history={false} action={action} />
              )}
              {page === "history" && (
                <TaskList tasks={tasks} history action={action} />
              )}
              {page === "settings" && (
                <Preferences
                  initial={settings}
                  tools={tools}
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
  onEnqueued: (count: number) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"audio" | "video">("audio");
  const [format, setFormat] = useState(settings.audioFormat);
  const [quality, setQuality] = useState(0);
  const [bitrate, setBitrate] = useState(settings.mp3Bitrate);
  const [destination, setDestination] = useState(settings.destination);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [inputError, setInputError] = useState("");
  const entries = media.flatMap((m) =>
    m.isPlaylist
      ? m.entries
      : [{ id: m.id, url: m.url, title: m.title, duration: m.duration }],
  );
  const uniqueEntries = [...new Map(entries.map((e) => [e.url, e])).values()];
  const resolutions = [
    ...new Set(
      media.flatMap((m) =>
        m.formats.flatMap((f) => (f.height ? [f.height] : [])),
      ),
    ),
  ]
    .filter((h) => [360, 480, 720, 1080, 1440, 2160].includes(h))
    .sort((a, b) => a - b);
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
    setMedia([]);
    setSelected(new Set());
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
      setSelected(new Set(all));
    } finally {
      setBusy(false);
      setAnalysis("");
    }
  }
  async function enqueue() {
    if (!destination.trim()) {
      report(
        new Error(
          "Choisissez un dossier de destination dans les options de sortie.",
        ),
      );
      return;
    }
    setAdding(true);
    let count = 0;
    try {
      for (const item of uniqueEntries.filter((e) => selected.has(e.url))) {
        const request: DownloadRequest = {
          url: item.url,
          title: item.title,
          kind,
          format,
          quality,
          bitrate,
          destination,
          metadata: settings.metadata,
        };
        try {
          await native.enqueue(request);
          count++;
        } catch (error) {
          report(error);
        }
      }
      if (count) await onEnqueued(count);
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
            setMedia([]);
            setSelected(new Set());
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
            {analysis} Les grandes playlists sont limitées aux 200 premiers
            éléments.
          </p>
        )}
      </form>
      <section className="output-section" aria-labelledby="output-title">
        <div className="section-title">
          <h2 id="output-title">Options de sortie</h2>
          <span>Traitement sur cet ordinateur</span>
        </div>
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
        <p className="hint">
          <Info size={15} />
          {kind === "audio"
            ? "La conversion ne peut pas améliorer la qualité de la source. FLAC et WAV occupent plus d’espace."
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
                    : new Set(uniqueEntries.map((e) => e.url)),
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
                {m.title} · Jusqu’à 200 éléments par analyse
              </p>
            ))}
          <div className="media-list">
            {uniqueEntries.map((item) => (
              <label className="media-row" key={item.url}>
                <input
                  type="checkbox"
                  checked={selected.has(item.url)}
                  onChange={() =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (next.has(item.url)) next.delete(item.url);
                      else next.add(item.url);
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
                </span>
              </label>
            ))}
          </div>
          {uniqueEntries.length === 0 && (
            <p>Aucun élément public compatible dans cette sélection.</p>
          )}
          <div className="result-footer">
            <span>
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <button
              className="primary"
              disabled={!selected.size || adding || busy}
              onClick={() => {
                void enqueue();
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

function TaskList({
  tasks,
  history,
  action,
}: {
  tasks: Task[];
  history: boolean;
  action: (op: () => Promise<unknown>) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const list = tasks
    .filter(
      (t) =>
        (!history || terminal(t.status)) &&
        `${t.request.title} ${t.request.url}`
          .toLocaleLowerCase("fr")
          .includes(search.toLocaleLowerCase("fr")) &&
        (filter === "all" || t.status === filter),
    )
    .sort((a, b) =>
      history ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
    );
  async function run(id: string, op: () => Promise<unknown>) {
    setPending(id);
    try {
      await action(op);
    } finally {
      setPending(null);
    }
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
        </select>
      </div>
      <div className="list-summary">
        {list.length} tâche{list.length > 1 ? "s" : ""}
        {!history &&
          ` · ${tasks.filter((t) => !terminal(t.status)).length} en cours ou en attente`}
      </div>
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
                  <span>{task.request.format.toUpperCase()}</span>
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
  report,
  onSave,
  onTools,
}: {
  initial: Settings;
  tools: ToolInfo[];
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
        <p className="hint">
          Aucune mise à jour silencieuse. La récupération des composants
          s’effectue avec les scripts documentés du projet.
        </p>
      </section>
    </div>
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
          AudioForge s’appuie sur yt-dlp, FFmpeg et ffprobe. Une conversion en
          MP3 320 kb/s ou FLAC n’améliore pas une source déjà compressée. Les
          restrictions des plateformes restent applicables.
        </p>
      </section>
      <section>
        <h2>Composants et licences</h2>
        <ToolList tools={tools} />
        <p>
          Les versions, sources et obligations de redistribution sont suivies
          dans THIRD_PARTY_LICENSES.md. Le code AudioForge est sous licence MIT
          ; les composants tiers conservent leurs licences respectives.
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
