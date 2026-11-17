import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  ArrowDownToLine,
  AudioLines,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  FileAudio2,
  Film,
  Info,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import type { Status } from "../types";
import { size, statuses, terminal } from "../utils";
import {
  audioFormats,
  bitrates,
  heights,
  lossless,
  nameFromUrl,
  outputName,
  validateDirectUrl,
  videoFormats,
  type ConversionOptions,
  type Kind,
} from "./formats";
import { cancelConversion, convert, fetchMedia, loadEngine } from "./engine";

type WebPage = "convert" | "jobs" | "about";
type Source = { id: string; name: string; size: number | null } & (
  { file: File } | { url: string }
);
interface Job {
  id: string;
  name: string;
  options: ConversionOptions;
  status: Status;
  progress: number;
  phase: string;
  error: string | null;
  output: { name: string; url: string; size: number } | null;
}

const navigation = [
  { id: "convert", label: "Convertir", icon: Wand2 },
  { id: "jobs", label: "Conversions", icon: ArrowDownToLine },
  { id: "about", label: "À propos", icon: Info },
] as const;
const DESKTOP_REPO = "https://github.com/raphaelmounirpro-creator/Audio-Forge";
let sequence = 0;
const newId = () => `${Date.now().toString(36)}-${++sequence}`;
const message = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string"
    ? error.message
    : "La conversion a échoué. Réessayez.";

export function WebApp() {
  const [page, setPage] = useState<WebPage>("convert");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [engineReady, setEngineReady] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const sources = useRef(new Map<string, Source>());
  const running = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, change: Partial<Job>) => {
    setJobs((old) => old.map((j) => (j.id === id ? { ...j, ...change } : j)));
  }, []);

  const run = useCallback(
    async (job: Job) => {
      const source = sources.current.get(job.id);
      if (!source) return;
      running.current = job.id;
      const controller = new AbortController();
      try {
        let blob: Blob;
        if ("file" in source) blob = source.file;
        else {
          abort.current = controller;
          patch(job.id, {
            status: "downloading",
            progress: 0,
            phase: "Lecture du lien",
          });
          blob = await fetchMedia(
            source.url,
            (received, total) =>
              patch(job.id, {
                progress: total ? (received / total) * 100 : 0,
                phase: `${size(received)} reçus`,
              }),
            controller.signal,
          );
        }
        patch(job.id, {
          status: "processing",
          progress: 0,
          phase: engineReady
            ? "Conversion"
            : "Chargement du moteur (environ 32 Mo, une seule fois)",
        });
        await loadEngine();
        setEngineReady(true);
        patch(job.id, { phase: "Conversion" });
        const result = await convert(blob, source.name, job.options, (ratio) =>
          patch(job.id, { progress: ratio * 100 }),
        );
        if (running.current !== job.id) return;
        const name = outputName(source.name, job.options.format);
        patch(job.id, {
          status: "completed",
          progress: 100,
          phase: "",
          output: { name, url: URL.createObjectURL(result), size: result.size },
        });
      } catch (error) {
        if (running.current !== job.id) return;
        patch(job.id, {
          status: "failed",
          phase: "",
          error: message(error),
        });
      } finally {
        if (running.current === job.id) running.current = null;
        if (abort.current === controller) abort.current = null;
        setJobs((old) => [...old]);
      }
    },
    [engineReady, patch],
  );

  useEffect(() => {
    if (running.current) return;
    const next = jobs.find((j) => j.status === "queued");
    if (next) void run(next);
  }, [jobs, run]);

  function cancel(job: Job) {
    if (running.current === job.id) {
      running.current = null;
      abort.current?.abort();
      if (job.status === "processing") {
        cancelConversion();
        setEngineReady(false);
      }
    }
    patch(job.id, { status: "cancelled", phase: "", progress: 0 });
  }
  function retry(job: Job) {
    patch(job.id, {
      status: "queued",
      progress: 0,
      phase: "",
      error: null,
    });
  }
  function remove(job: Job) {
    if (job.output) URL.revokeObjectURL(job.output.url);
    sources.current.delete(job.id);
    setJobs((old) => old.filter((j) => j.id !== job.id));
  }
  function enqueue(list: Source[], options: ConversionOptions) {
    const added: Job[] = list.map((source) => {
      const id = newId();
      sources.current.set(id, { ...source, id });
      return {
        id,
        name: source.name,
        options: {
          ...options,
          title: options.title || source.name.replace(/\.[^.]{1,8}$/, ""),
        },
        status: "queued",
        progress: 0,
        phase: "",
        error: null,
        output: null,
      };
    });
    setJobs((old) => [...old, ...added]);
    setNotice({
      text: `${added.length} conversion${added.length > 1 ? "s ajoutées" : " ajoutée"} à la file.`,
      error: false,
    });
    setPage("jobs");
  }

  const active = jobs.filter((j) => !terminal(j.status)).length;
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
              {item.id === "jobs" && active > 0 && (
                <span className="nav-count">{active}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={19} />
          <p>
            Gratuit. Sans compte.
            <small>Vos fichiers ne quittent pas votre appareil.</small>
          </p>
        </div>
        <div className="version">
          AudioForge <span>v0.1.0 · Version web</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>{navigation.find((p) => p.id === page)?.label}</span>
          <span className="local-badge">
            <span className={`status-dot ${engineReady ? "ready" : ""}`} />
            {engineReady ? "Moteur chargé" : "Traitement dans le navigateur"}
          </span>
        </header>
        <main id="content" tabIndex={-1}>
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
          {page === "convert" && <Convert onAdd={enqueue} />}
          {page === "jobs" && (
            <Jobs
              jobs={jobs}
              onCancel={cancel}
              onRetry={retry}
              onRemove={remove}
              onNew={() => setPage("convert")}
            />
          )}
          {page === "about" && <About />}
        </main>
        <footer className="statusbar">
          <span>
            <ShieldCheck size={14} /> Aucun envoi de fichier · Aucune télémétrie
          </span>
          <span>FFmpeg WebAssembly</span>
        </footer>
      </div>
    </div>
  );
}

function Convert({
  onAdd,
}: {
  onAdd: (sources: Source[], options: ConversionOptions) => void;
}) {
  const [selection, setSelection] = useState<Source[]>([]);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState<Kind>("audio");
  const [format, setFormat] = useState<ConversionOptions["format"]>("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [reencode, setReencode] = useState(false);
  const [height, setHeight] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const added = [...files].map((file) => ({
      id: newId(),
      name: file.name,
      size: file.size,
      file,
    }));
    setSelection((old) => [...old, ...added]);
  }
  function addLink(e: FormEvent) {
    e.preventDefault();
    const error = validateDirectUrl(link);
    if (error) {
      setLinkError(error);
      return;
    }
    const url = link.trim();
    setSelection((old) => [
      ...old,
      { id: newId(), name: nameFromUrl(url), size: null, url },
    ]);
    setLink("");
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }
  const options: ConversionOptions = {
    kind,
    format,
    bitrate,
    reencode,
    height: reencode ? height : 0,
    title: "",
  };
  return (
    <div className="home-page">
      <div className="page-heading">
        <h1>Convertissez vos médias, sans les envoyer.</h1>
        <p>
          Choisissez un fichier audio ou vidéo et son format de sortie. La
          conversion se fait dans votre navigateur : aucun fichier n’est
          transmis à un serveur.
        </p>
      </div>
      <section
        className={`link-panel drop-zone ${dragging ? "dragging" : ""}`}
        aria-labelledby="sources-title"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <h2 id="sources-title" className="panel-title">
          Vos fichiers audio ou vidéo
        </h2>
        <div className="drop-target">
          <Upload size={26} />
          <p>Glissez vos fichiers ici, ou</p>
          <button
            type="button"
            className="primary"
            onClick={() => input.current?.click()}
          >
            <Plus size={18} />
            Choisir des fichiers
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept="audio/*,video/*,.mkv,.flac,.opus"
            className="visually-hidden"
            aria-label="Choisir des fichiers audio ou vidéo"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <small>Jusqu’à 1 Go par fichier.</small>
        </div>
        <form className="direct-link" onSubmit={addLink}>
          <label htmlFor="direct-url">Ou un lien direct vers un fichier</label>
          <div className="folder-input">
            <input
              id="direct-url"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setLinkError("");
              }}
              placeholder="https://exemple.org/enregistrement.mp3"
              aria-invalid={!!linkError}
              aria-describedby={linkError ? "link-error" : "link-help"}
              spellCheck={false}
            />
            <button className="secondary" type="submit" disabled={!link.trim()}>
              <Link2 size={18} />
              <span>Ajouter</span>
            </button>
          </div>
          {linkError ? (
            <p className="field-error" id="link-error" role="alert">
              {linkError}
            </p>
          ) : (
            <p className="hint" id="link-help">
              Fonctionne si le site autorise la lecture depuis un navigateur
              (Wikimedia Commons, certains fichiers Archive.org…).
            </p>
          )}
        </form>
      </section>
      {selection.length > 0 && (
        <section className="results" aria-labelledby="selection-title">
          <div className="section-title">
            <h2 id="selection-title">
              {selection.length} fichier{selection.length > 1 ? "s" : ""}{" "}
              sélectionné{selection.length > 1 ? "s" : ""}
            </h2>
            <button className="text-button" onClick={() => setSelection([])}>
              Tout retirer
            </button>
          </div>
          <div className="media-list">
            {selection.map((item) => (
              <div className="media-row" key={item.id}>
                <div className="media-icon">
                  {"url" in item ? (
                    <Link2 size={23} />
                  ) : (
                    <FileAudio2 size={23} />
                  )}
                </div>
                <span className="media-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {"url" in item
                      ? new URL(item.url).hostname
                      : size(item.size ?? 0)}
                  </small>
                </span>
                <button
                  className="icon-button push-right"
                  aria-label={`Retirer ${item.name}`}
                  onClick={() =>
                    setSelection((old) => old.filter((s) => s.id !== item.id))
                  }
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="output-section" aria-labelledby="output-title">
        <div className="section-title">
          <h2 id="output-title">Options de sortie</h2>
          <span>Traitement dans ce navigateur</span>
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
                  setFormat("mp3");
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
                  setFormat("mp4");
                }}
              >
                <Film size={17} />
                Vidéo
              </button>
            </div>
          </div>
          <label className="field">
            Format
            <select
              value={format}
              onChange={(e) =>
                setFormat(e.target.value as ConversionOptions["format"])
              }
            >
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
              Débit
              <select
                value={bitrate}
                disabled={lossless(format)}
                onChange={(e) => setBitrate(Number(e.target.value))}
              >
                {bitrates.map((n) => (
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
                value={height}
                disabled={!reencode}
                onChange={(e) => setHeight(Number(e.target.value))}
              >
                <option value={0}>Identique à la source</option>
                {heights.map((h) => (
                  <option key={h} value={h}>
                    {h}p
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {kind === "video" && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={reencode}
              onChange={(e) => setReencode(e.target.checked)}
            />
            <span>
              Réencoder la vidéo
              <small>
                Plus compatible et permet de réduire la résolution, mais
                beaucoup plus lent dans un navigateur.
              </small>
            </span>
          </label>
        )}
        <p className="hint">
          <Info size={15} />
          {kind === "audio"
            ? "La conversion ne peut pas améliorer la qualité de la source. FLAC et WAV occupent plus d’espace."
            : reencode
              ? "Le réencodage peut prendre plusieurs minutes. Gardez cet onglet ouvert."
              : "Le conteneur est modifié sans réencodage. Certaines combinaisons de codecs et de conteneurs sont incompatibles."}
        </p>
      </section>
      <div className="result-footer">
        <span>
          {selection.length
            ? `${selection.length} prêt${selection.length > 1 ? "s" : ""} à convertir`
            : "Aucun fichier sélectionné"}
        </span>
        <button
          className="primary"
          disabled={!selection.length}
          onClick={() => {
            onAdd(selection, options);
            setSelection([]);
          }}
        >
          <Wand2 size={18} />
          Lancer la conversion
        </button>
      </div>
      <p className="rights-note">
        <ShieldCheck size={15} />
        Utilisez uniquement des contenus que vous avez le droit de copier et de
        convertir. Les fichiers protégés par DRM ne sont pas pris en charge.
      </p>
    </div>
  );
}

function Jobs({
  jobs,
  onCancel,
  onRetry,
  onRemove,
  onNew,
}: {
  jobs: Job[];
  onCancel: (job: Job) => void;
  onRetry: (job: Job) => void;
  onRemove: (job: Job) => void;
  onNew: () => void;
}) {
  return (
    <div>
      <div className="page-heading">
        <h1>Chaque conversion à sa place.</h1>
        <p>
          Les fichiers convertis restent dans cet onglet jusqu’à ce que vous les
          enregistriez. Fermer ou recharger la page les efface.
        </p>
      </div>
      <div className="list-summary">
        {jobs.length} conversion{jobs.length > 1 ? "s" : ""} ·{" "}
        {jobs.filter((j) => !terminal(j.status)).length} en cours ou en attente
      </div>
      {jobs.length === 0 ? (
        <div className="empty">
          <div className="empty-symbol">
            <Download size={30} />
          </div>
          <h2>La file est libre.</h2>
          <p>Les fichiers ajoutés depuis « Convertir » apparaîtront ici.</p>
          <button className="secondary" onClick={onNew}>
            <Plus size={18} />
            Ajouter des fichiers
          </button>
        </div>
      ) : (
        <div className="task-list">
          {jobs.map((job) => (
            <article className="task-row" key={job.id}>
              <div className="media-icon">
                {job.options.kind === "audio" ? (
                  <FileAudio2 size={23} />
                ) : (
                  <Film size={23} />
                )}
              </div>
              <div className="task-content">
                <div className="task-heading">
                  <h2>{job.name}</h2>
                  <span className={`task-status ${job.status}`}>
                    {job.status === "completed" ? (
                      <Check size={14} />
                    ) : job.status === "failed" ? (
                      <CircleAlert size={14} />
                    ) : (
                      <Clock3 size={14} />
                    )}
                    {statuses[job.status]}
                  </span>
                </div>
                <div className="task-meta">
                  <span>{job.options.format.toUpperCase()}</span>
                  {job.output && <span>{size(job.output.size)}</span>}
                  {job.phase && <span>{job.phase}</span>}
                </div>
                {!terminal(job.status) && (
                  <div className="progress-line">
                    <progress
                      aria-label={`Progression de ${job.name}`}
                      value={job.progress}
                      max={100}
                    />
                    <span>{Math.round(job.progress)} %</span>
                  </div>
                )}
                {job.error && <p className="task-error">{job.error}</p>}
                {job.output && (
                  <a
                    className="primary download-link"
                    href={job.output.url}
                    download={job.output.name}
                  >
                    <Download size={18} />
                    Enregistrer {job.output.name}
                  </a>
                )}
              </div>
              <div className="task-actions">
                {["failed", "cancelled"].includes(job.status) && (
                  <button
                    className="icon-button"
                    aria-label={`Réessayer ${job.name}`}
                    title="Réessayer"
                    onClick={() => onRetry(job)}
                  >
                    <RefreshCw size={18} />
                  </button>
                )}
                {!terminal(job.status) ? (
                  <button
                    className="icon-button"
                    aria-label={`Annuler ${job.name}`}
                    title="Annuler"
                    onClick={() => onCancel(job)}
                  >
                    <X size={18} />
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    aria-label={`Retirer ${job.name}`}
                    title="Retirer de la liste"
                    onClick={() => onRemove(job)}
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

function About() {
  return (
    <div className="about-page">
      <div className="about-logo">
        <AudioLines size={40} />
      </div>
      <h1>AudioForge</h1>
      <p className="about-subtitle">
        Votre atelier multimédia, dans votre navigateur.
      </p>
      <span className="version-label">Version web 0.1.0</span>
      <section>
        <h2>Vos fichiers restent chez vous.</h2>
        <p>
          La conversion est faite par FFmpeg compilé en WebAssembly et exécuté
          dans votre navigateur. Les fichiers choisis ne sont envoyés à aucun
          serveur. Seuls les liens directs que vous ajoutez sont lus depuis leur
          site d’origine. Aucun compte, aucune publicité, aucune télémétrie.
        </p>
      </section>
      <section>
        <h2>Limites de la version web</h2>
        <p>
          Le navigateur ne peut pas récupérer un média depuis une page YouTube
          ou Vimeo, et la mémoire disponible limite les fichiers à 1 Go. La
          conversion est plus lente qu’avec un programme installé. L’
          <a className="inline-link" href={DESKTOP_REPO}>
            application Windows
          </a>{" "}
          couvre ces usages.
        </p>
      </section>
      <section>
        <h2>Composants et licences</h2>
        <p>
          Le code AudioForge est sous licence MIT. La conversion utilise{" "}
          <a
            className="inline-link"
            href="https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10"
          >
            ffmpeg.wasm 0.12.10
          </a>{" "}
          (@ffmpeg/core, GPL-2.0-or-later, avec FFmpeg, LAME, x264, libvpx et
          Opus), distribué sans modification. Son code source est disponible
          dans le dépôt ffmpeg.wasm à cette version, qui fixe les versions de
          FFmpeg et des bibliothèques intégrées. Les{" "}
          <a
            className="inline-link"
            href={`${DESKTOP_REPO}/blob/main/THIRD_PARTY_LICENSES.md`}
          >
            licences tierces
          </a>{" "}
          sont détaillées dans le dépôt du projet.
        </p>
      </section>
      <section>
        <h2>Utilisation autorisée</h2>
        <p>
          Convertissez uniquement les contenus dont vous détenez les droits ou
          pour lesquels vous disposez d’une autorisation. Aucun contournement de
          DRM n’est prévu.
        </p>
      </section>
    </div>
  );
}
