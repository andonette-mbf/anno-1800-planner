"use client";

/* One dropdown for the whole app (build 65).
 *
 * Every menu used to be a native <select>, so the closed control was ours but
 * the open list was the OS's — grey Aqua popup, system font, no way to show a
 * quest note next to the quest. This renders the list itself, in the same
 * language as the calculator's good picker (`.pop`/`.opt`), so the two kinds
 * of menu in the app finally look like one thing.
 *
 * It stays a drop-in for <select>: same controlled `value`/`onChange(value)`,
 * same "placeholder option with value=''" idiom the ＋Add menus rely on, and
 * it fires onChange on every pick — including re-picking what is already
 * selected — because that is what the native element does and what those
 * menus need to fire twice.
 *
 * The list is portalled to <body> and positioned fixed: several of these sit
 * inside island cards and scrolling wrappers that would otherwise clip a
 * popup, and an absolute one inside `.islehd` gets cut off at the card edge.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type DropOption = {
  value: string;
  label: string;
  /** Tooltip, and the second line when the menu opts into `hints`. */
  title?: string;
  /** Renders as a non-selectable note — the growth menu's "no residents" rows. */
  disabled?: boolean;
};

export type DropGroup = { group: string; options: DropOption[] };

export type DropItem = DropOption | DropGroup;

function isGroup(i: DropItem): i is DropGroup {
  return (i as DropGroup).options !== undefined;
}

/** Groups flattened to rows, so keyboard nav and rendering share one index. */
type Row =
  | { kind: "group"; label: string }
  | { kind: "option"; opt: DropOption };

const MENU_MAX_H = 320; // matches .pop's max-height
const MIN_W = 220;
const GAP = 6;

export function Dropdown({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  title,
  placeholder,
  hints = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropItem[];
  className?: string;
  ariaLabel: string;
  title?: string;
  /**
   * Button label when nothing matches `value`. The ＋Add menus live on an
   * empty value forever, so their prompt belongs here rather than as an
   * option — listing it would show it ticked as if it were a choice.
   */
  placeholder?: string;
  /** Show each option's `title` as a second line (long, explanatory menus). */
  hints?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxH: number;
  } | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ str: "", at: 0 });
  const id = useId();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const item of options) {
      if (isGroup(item)) {
        out.push({ kind: "group", label: item.group });
        for (const opt of item.options) out.push({ kind: "option", opt });
      } else {
        out.push({ kind: "option", opt: item });
      }
    }
    return out;
  }, [options]);

  const pickable = useCallback(
    (i: number) => rows[i]?.kind === "option" && !(rows[i] as { opt: DropOption }).opt.disabled,
    [rows]
  );

  const current = useMemo(() => {
    // Disabled rows are skipped: the growth menu's "no residents" notes also
    // carry an empty value, and one of those would otherwise become the
    // button's label for every menu sitting on "".
    for (const r of rows)
      if (r.kind === "option" && !r.opt.disabled && r.opt.value === value) return r.opt;
    return null;
  }, [rows, value]);

  /* Anchor the portalled list to the button. Flips above when the space below
     can't hold it and there is more room up top. */
  const place = useCallback(() => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const flip = below < Math.min(MENU_MAX_H, 180) && above > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8));
    setPos({
      left,
      ...(flip
        ? { bottom: window.innerHeight - r.top + GAP }
        : { top: r.bottom + GAP }),
      // Pinned to the control's own width rather than left to size itself:
      // a hint line is a whole sentence, and content-sizing let the storyline
      // menu run to the edge of the window. Narrow controls (the t/min unit,
      // the region chip) get a floor so their labels still fit.
      width: Math.min(Math.max(r.width, MIN_W), window.innerWidth - left - 8),
      maxH: Math.min(MENU_MAX_H, Math.max(120, flip ? above : below)),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    // `true` so a scroll in any ancestor container moves the list with us.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, place]);

  // Keep the highlighted row in view for arrow-key and type-ahead nav.
  useEffect(() => {
    if (!open || active < 0) return;
    popRef.current
      ?.querySelector(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openWith = (from: "first" | "last" | "current") => {
    let i = -1;
    if (from === "current") i = rows.findIndex((r) => r.kind === "option" && r.opt === current);
    if (i < 0) {
      i = from === "last" ? rows.length - 1 : 0;
      while (i >= 0 && i < rows.length && !pickable(i)) i += from === "last" ? -1 : 1;
    }
    setActive(i);
    setOpen(true);
  };

  const step = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < rows.length; n++) {
      i += dir;
      if (i < 0) i = rows.length - 1;
      if (i >= rows.length) i = 0;
      if (pickable(i)) break;
    }
    setActive(i);
  };

  const commit = (i: number) => {
    const r = rows[i];
    if (!r || r.kind !== "option" || r.opt.disabled) return;
    // Fires even when the value is unchanged — the ＋Add menus sit on value=""
    // permanently and need every pick to come through.
    onChange(r.opt.value);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openWith(e.key === "ArrowDown" ? "current" : "current");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openWith("last");
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        break;
      case "Home":
      case "End": {
        e.preventDefault();
        let i = e.key === "Home" ? 0 : rows.length - 1;
        while (i >= 0 && i < rows.length && !pickable(i)) i += e.key === "Home" ? 1 : -1;
        setActive(i);
        break;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Type-ahead: island lists get long, and typing "Cr" should still work.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = performance.now();
          const t = typed.current;
          t.str = now - t.at > 900 ? e.key : t.str + e.key;
          t.at = now;
          const q = t.str.toLowerCase();
          const hit = rows.findIndex(
            (r, i) => pickable(i) && r.kind === "option" && r.opt.label.toLowerCase().startsWith(q)
          );
          if (hit >= 0) setActive(hit);
        }
    }
  };

  const cls = ["ddbtn", className, open ? "open" : ""].filter(Boolean).join(" ");

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cls}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-o${active}` : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openWith("current"))}
        onKeyDown={onKeyDown}
      >
        <span className={current ? "ddval" : "ddval ph"}>
          {current ? current.label : placeholder ?? ""}
        </span>
        <span className="ddcar" aria-hidden="true" />
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            id={`${id}-list`}
            className="pop ddpop open"
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: pos.width,
              maxHeight: pos.maxH,
            }}
          >
            {rows.map((r, i) =>
              r.kind === "group" ? (
                <div key={`g${i}`} className="ddgrp">
                  {r.label}
                </div>
              ) : (
                <div
                  key={`o${i}`}
                  id={`${id}-o${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={r.opt.value === value}
                  aria-disabled={r.opt.disabled || undefined}
                  title={hints ? undefined : r.opt.title}
                  className={[
                    "opt",
                    "ddopt",
                    r.opt.disabled ? "off" : "",
                    i === active ? "act" : "",
                    r.opt.value === value && !r.opt.disabled ? "on" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onPointerEnter={() => pickable(i) && setActive(i)}
                  onClick={() => commit(i)}
                >
                  <span className="optlbl">
                    <b>{r.opt.label}</b>
                    {hints && r.opt.title && <span>{r.opt.title}</span>}
                  </span>
                </div>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}

export default Dropdown;
