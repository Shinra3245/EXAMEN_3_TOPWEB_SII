"use client";

import { useSyncExternalStore, useEffect } from "react";
import { flushSync } from "react-dom";

export type VisualStyle = "pixelretro" | "mosaico" | "ilustracion";
export type VisualTheme = "claro" | "oscuro";

export interface VisualState {
  style: VisualStyle;
  theme: VisualTheme;
}

export const DEFAULT_VISUAL_STATE: VisualState = {
  style: "pixelretro",
  theme: "claro",
};

let currentState: VisualState = { ...DEFAULT_VISUAL_STATE };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  });
}

export function parseVisualQuery(search: string): Partial<VisualState> {
  try {
    const params = new URLSearchParams(search);
    const v = params.get("visual");
    const t = params.get("tema");
    const res: Partial<VisualState> = {};
    if (v === "pixelretro" || v === "mosaico") {
      res.style = v;
    } else if (v === "ilustracion") {
      res.style = "pixelretro";
    }
    if (t === "claro" || t === "oscuro") {
      res.theme = t;
    }
    return res;
  } catch {
    return {};
  }
}

export function parseVisualUrlParams(): Partial<VisualState> {
  if (typeof window === "undefined") return {};
  return parseVisualQuery(window.location.search);
}

export function parseVisualStorage(): Partial<VisualState> {
  if (typeof window === "undefined") return {};
  try {
    const v = localStorage.getItem("sii_visual_style");
    const t = localStorage.getItem("sii_visual_theme");
    const res: Partial<VisualState> = {};
    if (v === "pixelretro" || v === "mosaico") {
      res.style = v;
    } else if (v === "ilustracion") {
      res.style = "pixelretro";
    }
    if (t === "claro" || t === "oscuro") {
      res.theme = t;
    }
    return res;
  } catch {
    return {};
  }
}

export function syncVisualState(): boolean {
  if (typeof window === "undefined") return false;
  const fromUrl = parseVisualUrlParams();
  const fromStorage = parseVisualStorage();

  const nextStyle: VisualStyle =
    fromUrl.style ?? fromStorage.style ?? DEFAULT_VISUAL_STATE.style;
  const nextTheme: VisualTheme =
    fromUrl.theme ?? fromStorage.theme ?? DEFAULT_VISUAL_STATE.theme;

  try {
    localStorage.setItem("sii_visual_style", nextStyle);
    localStorage.setItem("sii_visual_theme", nextTheme);
  } catch {
    // Storage might be disabled or restricted
  }

  if (currentState.style !== nextStyle || currentState.theme !== nextTheme) {
    currentState = { style: nextStyle, theme: nextTheme };
    return true;
  }
  return false;
}

/**
 * Cambia el tema claro/oscuro desde la interfaz. Persiste en localStorage y,
 * si la URL ya trae ?tema=, la actualiza para que no prevalezca el valor viejo.
 */
export function setVisualTheme(theme: VisualTheme): void {
  if (currentState.theme === theme) return;
  // Fundido entre temas cuando el navegador lo soporta y el usuario no pidió menos movimiento.
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !reduceMotion) {
      // flushSync: el DOM debe actualizarse dentro del callback para capturar el estado nuevo.
      doc.startViewTransition(() => flushSync(() => applyVisualTheme(theme)));
      return;
    }
  }
  applyVisualTheme(theme);
}

function applyVisualTheme(theme: VisualTheme): void {
  currentState = { ...currentState, theme };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("sii_visual_theme", theme);
    } catch {
      // Storage might be disabled or restricted
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("tema")) {
        url.searchParams.set("tema", theme);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      // URL/history no disponibles
    }
  }
  notify();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): VisualState {
  return currentState;
}

function getServerSnapshot(): VisualState {
  return DEFAULT_VISUAL_STATE;
}

export function useVisualTheme(): VisualState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (syncVisualState()) {
      notify();
    }

    const handlePopState = () => {
      if (syncVisualState()) {
        notify();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return state;
}

/**
 * Agrega los parámetros ?visual=...&tema=... a una ruta para preservar
 * la variante visual durante la navegación si se desea.
 */
export function appendVisualParams(href: string, visual: VisualState): string {
  if (!href.startsWith("/")) return href;
  try {
    const [path, search] = href.split("?");
    const params = new URLSearchParams(search || "");
    params.set("visual", visual.style);
    params.set("tema", visual.theme);
    return `${path}?${params.toString()}`;
  } catch {
    return href;
  }
}
