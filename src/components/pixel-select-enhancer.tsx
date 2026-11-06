"use client";

import { useEffect } from "react";

/**
 * Lista desplegable propia para navegadores sin `appearance: base-select`
 * (p. ej. Firefox). Intercepta los <select> del portal y de los modales,
 * muestra una lista con el estilo pixel y escribe la opción elegida en el
 * <select> real, de modo que los formularios y los onChange no cambian.
 */
export function PixelSelectEnhancer() {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("appearance", "base-select")) return;

    let list: HTMLUListElement | null = null;
    let owner: HTMLSelectElement | null = null;
    let active = -1;
    const options: HTMLOptionElement[] = [];

    const scopeOf = (el: Element) =>
      el.closest<HTMLElement>('dialog[data-visual-modal][data-visual-style="pixelretro"], [data-visual-shell][data-visual-style="pixelretro"]');

    const close = () => {
      list?.remove();
      list = null;
      owner?.setAttribute("aria-expanded", "false");
      owner = null;
      active = -1;
      options.length = 0;
    };

    const paint = () => {
      list?.querySelectorAll("li").forEach((li, i) => {
        li.classList.toggle("is-active", i === active);
        if (i === active) {
          li.scrollIntoView({ block: "nearest" });
          list?.setAttribute("aria-activedescendant", li.id);
        }
      });
    };

    const choose = (index: number) => {
      const select = owner;
      const option = options[index];
      if (!select || !option || option.disabled) return;
      close();
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      select.focus();
    };

    const open = (select: HTMLSelectElement) => {
      close();
      const scope = scopeOf(select);
      if (!scope) return;
      owner = select;
      options.push(...Array.from(select.options));
      active = Math.max(0, select.selectedIndex);

      const rect = select.getBoundingClientRect();
      const ul = document.createElement("ul");
      ul.className = "pixel-listbox";
      ul.setAttribute("role", "listbox");
      // Capa superior: no la recorta el overflow ni el contexto de posición del <dialog>.
      ul.setAttribute("popover", "manual");
      options.forEach((option, i) => {
        const li = document.createElement("li");
        li.id = `pixel-opt-${i}`;
        li.setAttribute("role", "option");
        li.textContent = option.textContent;
        if (option.disabled) li.setAttribute("aria-disabled", "true");
        if (i === select.selectedIndex) li.setAttribute("aria-selected", "true");
        li.addEventListener("mousedown", (event) => event.preventDefault());
        li.addEventListener("click", () => choose(i));
        li.addEventListener("mousemove", () => {
          if (active !== i) {
            active = i;
            paint();
          }
        });
        ul.appendChild(li);
      });

      ul.style.minWidth = `${rect.width}px`;
      ul.style.left = `${rect.left}px`;
      scope.appendChild(ul);
      if (typeof ul.showPopover === "function") ul.showPopover();
      const below = window.innerHeight - rect.bottom;
      const height = Math.min(ul.offsetHeight, 416);
      ul.style.top = below >= height + 12 || rect.top < height + 12
        ? `${rect.bottom + 6}px`
        : `${rect.top - height - 6}px`;
      list = ul;
      select.setAttribute("aria-expanded", "true");
      paint();
    };

    const eligible = (target: EventTarget | null): HTMLSelectElement | null => {
      if (!(target instanceof HTMLSelectElement) || target.disabled || target.multiple) return null;
      return scopeOf(target) ? target : null;
    };

    const onMouseDown = (event: MouseEvent) => {
      const select = eligible(event.target);
      if (select) {
        event.preventDefault();
        select.focus();
        if (owner === select) close();
        else open(select);
        return;
      }
      if (list && !(event.target instanceof Node && list.contains(event.target))) close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (list && owner) {
        const last = options.length - 1;
        switch (event.key) {
          case "ArrowDown": active = Math.min(last, active + 1); break;
          case "ArrowUp": active = Math.max(0, active - 1); break;
          case "Home": active = 0; break;
          case "End": active = last; break;
          case "Enter":
          case " ": choose(active); break;
          case "Escape":
          case "Tab": close(); return;
          default: return;
        }
        event.preventDefault();
        paint();
        return;
      }
      const select = eligible(event.target);
      if (select && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open(select);
      }
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      close();
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  return null;
}
