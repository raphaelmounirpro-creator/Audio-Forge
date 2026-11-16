import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("interface en aperçu", () => {
  it("explique les limites natives sans inventer des téléchargements", () => {
    render(<App />);
    expect(screen.getByText(/L’interface est en aperçu/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Analyser les liens/ }),
    ).toBeDisabled();
    expect(screen.getByText("Votre atelier est prêt.")).toBeVisible();
  });
  it("rejette un lien local avant tout appel natif", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByLabelText("Vos liens audio ou vidéo"),
      "https://127.0.0.1",
    );
    await user.click(
      screen.getByRole("button", { name: /Analyser les liens/ }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Source compatible attendue",
    );
  });
  it("affiche une erreur explicite pour un lien valide dans le navigateur", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByLabelText("Vos liens audio ou vidéo"),
      "https://vimeo.com/123",
    );
    await user.click(
      screen.getByRole("button", { name: /Analyser les liens/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ouvrez l’application Windows".replace("’", "'"),
    );
    expect(screen.queryByText(/médias accessibles/)).not.toBeInTheDocument();
  });
  it("navigue vers la file, les paramètres et les licences", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Téléchargements" }));
    expect(screen.getByText("La file est libre.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Paramètres" }));
    expect(screen.getByLabelText("Téléchargements simultanés")).toHaveValue(
      "2",
    );
    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(screen.getByText("Gratuit, sans contrepartie.")).toBeVisible();
  });
});
