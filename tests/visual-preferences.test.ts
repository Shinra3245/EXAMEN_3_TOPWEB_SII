import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_VISUAL_STATE,
  appendVisualParams,
  parseVisualQuery,
  setVisualTheme,
  syncVisualState,
} from "../src/components/visual-theme";

describe("visual preferences and url synchronization", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    (globalThis as unknown as Record<string, unknown>).localStorage = storageMock;
    (globalThis as unknown as Record<string, unknown>).window = {
      location: {
        search: "",
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
    delete (globalThis as unknown as Record<string, unknown>).window;
  });

  it("provides default visual state as pixelretro / claro", () => {
    expect(DEFAULT_VISUAL_STATE.style).toBe("pixelretro");
    expect(DEFAULT_VISUAL_STATE.theme).toBe("claro");
  });

  it("parses valid URL search parameters for visual style and theme", () => {
    const parsed = parseVisualQuery("?visual=pixelretro&tema=oscuro");
    expect(parsed.style).toBe("pixelretro");
    expect(parsed.theme).toBe("oscuro");

    const parsedMosaico = parseVisualQuery("?visual=mosaico&tema=claro");
    expect(parsedMosaico.style).toBe("mosaico");
    expect(parsedMosaico.theme).toBe("claro");

    const parsedLegacy = parseVisualQuery("?visual=ilustracion&tema=oscuro");
    expect(parsedLegacy.style).toBe("pixelretro");
    expect(parsedLegacy.theme).toBe("oscuro");
  });

  it("ignores invalid or unexpected parameter values safely", () => {
    const parsed = parseVisualQuery("?visual=arcade&tema=neon");
    expect(parsed.style).toBeUndefined();
    expect(parsed.theme).toBeUndefined();
  });

  it("synchronizes visual state into localStorage without touching identity", () => {
    (globalThis.window.location as unknown as { search: string }).search =
      "?visual=mosaico&tema=oscuro";
    syncVisualState();
    expect(mockStorage["sii_visual_style"]).toBe("mosaico");
    expect(mockStorage["sii_visual_theme"]).toBe("oscuro");
    // Ensure no sensitive or identity keys are stored
    expect(mockStorage["student"]).toBeUndefined();
    expect(mockStorage["token"]).toBeUndefined();
  });

  it("appends visual parameters correctly to internal navigation links", () => {
    const currentVisual = { style: "mosaico" as const, theme: "oscuro" as const };
    const linkWithParams = appendVisualParams("/kardex", currentVisual);
    expect(linkWithParams).toBe("/kardex?visual=mosaico&tema=oscuro");

    const linkWithExistingQuery = appendVisualParams("/reportes?filter=mine", currentVisual);
    expect(linkWithExistingQuery).toContain("filter=mine");
    expect(linkWithExistingQuery).toContain("visual=mosaico");
    expect(linkWithExistingQuery).toContain("tema=oscuro");
  });

  it("alternates theme from the UI and persists it over the next sync", () => {
    syncVisualState();
    setVisualTheme("oscuro");
    expect(mockStorage["sii_visual_theme"]).toBe("oscuro");
    syncVisualState();
    expect(mockStorage["sii_visual_theme"]).toBe("oscuro");

    setVisualTheme("claro");
    expect(mockStorage["sii_visual_theme"]).toBe("claro");
  });

  it("rewrites ?tema= in the URL so it does not override the new choice", () => {
    let replaced = "";
    (globalThis as unknown as Record<string, unknown>).window = {
      location: { search: "?tema=claro", href: "https://portal.test/horario?tema=claro" },
      history: {
        state: null,
        replaceState: (_s: unknown, _t: string, url: string) => {
          replaced = url;
        },
      },
    };
    syncVisualState();
    setVisualTheme("oscuro");
    expect(replaced).toContain("tema=oscuro");
    expect(replaced).toContain("/horario");
  });
});
