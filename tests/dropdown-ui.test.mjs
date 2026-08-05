// The shared Dropdown (build 65), driven in jsdom the way a player drives it.
//
// This replaced eleven native <select>s, and the browser used to supply the
// behaviour for free. Now we own it, so the things a <select> did without
// being asked are exactly what can regress silently:
//
//  - picking the value that is ALREADY selected still fires onChange. Every
//    ＋Add menu sits on value="" forever and needs the second pick to fire,
//    which is what the native element does.
//  - a disabled option is inert AND never becomes the button's label. The
//    growth menu's "no residents" notes carry an empty value, so a naive
//    lookup shows one of those instead of the placeholder on every empty menu.
//  - the keyboard still works: arrows move, Enter commits, Escape closes.
import { execSync } from "node:child_process";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "build");

execSync("npx tsc -p tests/tsconfig.dropdown.json", { cwd: root, stdio: "inherit" });

const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://x.test/" });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
// jsdom has no layout, so it ships no scrollIntoView — the component calls it
// to keep the highlighted row visible.
dom.window.Element.prototype.scrollIntoView = function () {};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const DD = await import(path.join(out, "components/ui/Dropdown.js"));
const Dropdown = DD.Dropdown ?? DD.default?.Dropdown ?? DD.default;

let ok = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a);
  const B = JSON.stringify(b);
  if (A !== B) {
    console.error(`FAIL - ${msg}\n  expected ${B}\n  got      ${A}`);
    process.exit(1);
  }
  ok++;
  console.log(`ok - ${msg}`);
};

const container = document.getElementById("root");
const reactRoot = createRoot(container);

const picks = [];
let value = "";
let options = [];
let placeholder;

function App() {
  return React.createElement(Dropdown, {
    ariaLabel: "Test menu",
    placeholder,
    value,
    options,
    onChange: (v) => picks.push(v),
  });
}

const render = () => act(() => reactRoot.render(React.createElement(App)));
const btn = () => container.querySelector(".ddbtn");
const pop = () => document.body.querySelector(".ddpop");
const opts = () => [...(pop()?.querySelectorAll('[role="option"]') ?? [])];
const groups = () => [...(pop()?.querySelectorAll(".ddgrp") ?? [])].map((e) => e.textContent);
const label = () => btn().querySelector(".ddval").textContent;
const fire = (el, type, init = {}) =>
  act(() => {
    el.dispatchEvent(new dom.window[type === "click" ? "MouseEvent" : "KeyboardEvent"](type, { bubbles: true, ...init }));
  });

// ---- rendering -----------------------------------------------------------
options = [
  { value: "a", label: "Alpha" },
  { group: "Group B", options: [{ value: "b", label: "Beta" }, { value: "c", label: "Gamma" }] },
];
placeholder = "Pick one…";
render();

eq(btn().tagName, "BUTTON", "renders a button, not a native select");
eq(label(), "Pick one…", "empty value shows the placeholder");
eq(pop(), null, "list is closed until asked for");

fire(btn(), "click");
eq(
  opts().map((o) => o.textContent),
  ["Alpha", "Beta", "Gamma"],
  "opening lists every option, groups flattened in order"
);
eq(groups(), ["Group B"], "optgroup labels survive as group headers");

// ---- picking -------------------------------------------------------------
fire(opts()[2], "click");
eq(picks, ["c"], "clicking an option reports its value");
eq(pop(), null, "picking closes the list");

value = "c";
render();
eq(label(), "Gamma", "the button shows the selected option's label");

fire(btn(), "click");
eq(
  opts().filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.textContent),
  ["Gamma"],
  "the selected row is marked selected"
);
// The ＋Add menus depend on this: native <select> fires change on re-pick, and
// so must we, or the second "add this questline" is silently swallowed.
fire(opts()[2], "click");
eq(picks, ["c", "c"], "re-picking the current value fires again, as a <select> does");

// ---- disabled notes ------------------------------------------------------
picks.length = 0;
value = "";
options = [
  { value: "x", label: "Real choice" },
  { value: "", label: "— no residents: Beer, Wine", disabled: true },
];
render();
eq(label(), "Pick one…", "a disabled empty-value note never becomes the button label");

fire(btn(), "click");
fire(opts()[1], "click");
eq(picks, [], "a disabled option cannot be picked");
eq(!!pop(), true, "clicking a disabled option leaves the list open");

// ---- keyboard ------------------------------------------------------------
fire(btn(), "keydown", { key: "Escape" });
eq(pop(), null, "Escape closes the list");

fire(btn(), "keydown", { key: "ArrowDown" });
eq(!!pop(), true, "ArrowDown opens the list");
fire(btn(), "keydown", { key: "ArrowDown" });
fire(btn(), "keydown", { key: "Enter" });
eq(picks, ["x"], "arrow keys move and Enter commits, skipping the disabled note");

console.log(`\nDROPDOWN UI TESTS PASSED (${ok} checks)`);
