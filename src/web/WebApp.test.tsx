import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  loadEngine: vi.fn(),
  convert: vi.fn(),
  cancelConversion: vi.fn(),
  fetchMedia: vi.fn(),
}));
vi.mock("./engine", () => engine);
import { WebApp } from "./WebApp";

beforeEach(() => {
  vi.clearAllMocks();
  engine.loadEngine.mockResolvedValue({});
  URL.createObjectURL = vi.fn(() => "blob:resultat");
  URL.revokeObjectURL = vi.fn();
});

describe("version web", () => {
  it("convertit un fichier choisi et propose de l'enregistrer", async () => {
    const user = userEvent.setup();
    engine.convert.mockResolvedValue(new Blob(["mp3"], { type: "audio/mpeg" }));
    render(<WebApp />);
    const wav = new File(["RIFF"], "Concert.wav", { type: "audio/wav" });
    await user.upload(
      screen.getByLabelText("Choisir des fichiers audio ou vidéo"),
      wav,
    );
    expect(screen.getByText("1 fichier sélectionné")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Débit"), "320");
    await user.click(
      screen.getByRole("button", { name: "Lancer la conversion" }),
    );
    const link = await screen.findByRole("link", {
      name: /Enregistrer Concert\.mp3/,
    });
    expect(link).toHaveAttribute("href", "blob:resultat");
    expect(link).toHaveAttribute("download", "Concert.mp3");
    expect(engine.convert).toHaveBeenCalledWith(
      wav,
      "Concert.wav",
      expect.objectContaining({
        format: "mp3",
        bitrate: 320,
        title: "Concert",
      }),
      expect.any(Function),
    );
  });

  it("affiche l'erreur de conversion et permet de réessayer", async () => {
    const user = userEvent.setup();
    engine.convert
      .mockRejectedValueOnce(new Error("Conversion impossible : codec"))
      .mockResolvedValueOnce(new Blob(["ok"]));
    render(<WebApp />);
    await user.upload(
      screen.getByLabelText("Choisir des fichiers audio ou vidéo"),
      new File(["x"], "clip.mov", { type: "video/quicktime" }),
    );
    await user.click(screen.getByRole("button", { name: "Vidéo" }));
    await user.click(
      screen.getByRole("button", { name: "Lancer la conversion" }),
    );
    expect(
      await screen.findByText("Conversion impossible : codec"),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Réessayer clip.mov" }),
    );
    expect(
      await screen.findByRole("link", { name: /Enregistrer clip\.mp4/ }),
    ).toBeVisible();
  });

  it("refuse une page YouTube et accepte un lien direct", async () => {
    const user = userEvent.setup();
    render(<WebApp />);
    const field = screen.getByLabelText("Ou un lien direct vers un fichier");
    await user.type(field, "https://youtu.be/abc");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("application Windows");
    await user.clear(field);
    await user.type(field, "https://upload.wikimedia.org/x/Chant.ogg");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    const list = screen.getByRole("region", { name: /1 fichier sélectionné/ });
    expect(within(list).getByText("Chant.ogg")).toBeVisible();
    expect(within(list).getByText("upload.wikimedia.org")).toBeVisible();
  });

  it("navigue vers les conversions et la page À propos", async () => {
    const user = userEvent.setup();
    render(<WebApp />);
    expect(
      screen.getByRole("button", { name: "Lancer la conversion" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Conversions" }));
    expect(screen.getByText("La file est libre.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(screen.getByText("Vos fichiers restent chez vous.")).toBeVisible();
    expect(engine.loadEngine).not.toHaveBeenCalled();
  });
});
