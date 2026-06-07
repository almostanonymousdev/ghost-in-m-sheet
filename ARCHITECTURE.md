# Architecture — start here

A one-page map of how *Ghost in M'Sheet* fits together. Read this first, then
dive into the area you care about. For build/setup details see
[README.md](README.md) and [SETUP.md](SETUP.md); for how to contribute see
[CONTRIBUTING.md](CONTRIBUTING.md).

## The 30-second model

The game is a [Twine](https://twinery.org/) story written in **Twee** (`.tw`
files) using the **SugarCube 2** story format. [Tweego](https://github.com/tmedwards/tweego)
compiles every `.tw` and `.js` file under `passages/` into a single
self-contained `ghost-in-msheet.html` you open in a browser — no server needed.

Two kinds of source file:

- **Passages** (`.tw`) — *content*. Story text, menus, and the macros that
  render a screen. One `:: PassageName` block per screen.
- **Controllers** (`.js`) — *logic*. Plain JavaScript modules that hang
  helpers off a global `setup` object (`setup.HuntController`, `setup.Mc`, …).
  Passages call `setup.Foo.bar()`; they almost never touch game state directly.

Game state lives in SugarCube's `State.variables` (written `$foo` in passages,
`State.variables.foo` / `sv().foo` in JS).

## Build & test

| Command | What it does |
| --- | --- |
| `npm run build` | Compile sources → `ghost-in-msheet.html` |
| `npm start` | Build, then open in your browser |
| `npm run watch` | Auto-rebuild on file change (Linux; needs `inotify-tools`) |
| `npm run lint` | Twee format check (`tools/check_format.py`) |
| `npm test` | Lint + Playwright (`lint`, `chromium`, `mobile` projects) |

First time? Run `npm run setup` once to fetch Tweego + SugarCube. The `tools/`
directory holds a suite of Python linters (links, assets, reachability, undefined
vars, …) that the build and CI run for you.

## Repo layout

```
passages/            story passages (.tw) + the controllers (.js) that own them
  StoryData.tw         format version, start passage ("Intro"), tag colors
  StoryInit.tw         boots state: setup.Game.initState() + HUD meters
  StoryCaption.tw      left sidebar (HUD, links)
  mc/ companion/       the player character + companions
  ghosts/              the Ghost class + an 18-entry catalogue (GHOST_CONFIG)
  hunt/                the hunt run: lifecycle, floor plans, modifiers, minimap
  haunted_houses/      per-house passages + search tools
  home/ witch/ church/ delivery/ park/ gym/ mall/ salon/ library/ …  locations
  gui/                 HUD, keyboard nav, dialogue macros, bag/notebook/phone
  events/ time/ styles/ updates/   cross-cutting systems
config/              Tweego, Playwright, and IDE macro-tooltip configs
tools/               Python linters + the asset/release helpers
tests/               Playwright specs (unit-style at root, end-to-end in e2e/)
plotlines/           design docs, one per story arc — read these for narrative
```

## The controller pattern

Every non-trivial subsystem is one IIFE with the same shape. Learn it once and
every controller reads the same way:

```js
setup.Foo = (function () {
  // The ONLY state this controller is allowed to write.
  var OWNED_VARS = Object.freeze(['fooBar']);
  var sv = setup.sv;                       // shorthand for State.variables

  var api = {
    OWNED_VARS: OWNED_VARS,
    barCount: function () { return sv().fooBar.length; },
  };

  // Generates fooBar()/setFooBar(x)/addFooBar(x)/removeFooBar(x) so you don't
  // hand-roll them. Lives in passages/MeterController.js.
  setup.defineAccessors(api, sv, ['fooBar']);

  return api;
})();
```

Two rules keep this honest (both lint-enforced):

- **A controller writes only its own `OWNED_VARS`.** Need another controller's
  state? Call its API, i.e. `setup.Other.setWhatever(x)`. (`tools/check_owned_vars.py`)
- **Method names follow a fixed verb scheme:** `money()` not `getMoney()`;
  `setMoney()`, `addMoney()`, `removeMoney()`; predicates are `hasX`/`canX`/`isX`;
  test-only helpers are prefixed `cheat`. (`tests/controller-naming-lint.spec.js`)

Controllers are concatenated by Tweego before any passage runs, so every
`setup.Foo` is guaranteed to exist — **never** guard with `if (setup.Foo)`.

## State: `$variable` bundles

State is grouped into one object per subsystem (not loose flat keys), so a save
migration is usually a single "fill in the default if missing" line. The owner
controller is the only writer.

| Bundle | Owned by | Holds |
| --- | --- | --- |
| `$mc` | `setup.Mc` | money, sanity, lust, energy, level, body sensitivities |
| `$run` | `setup.HuntController` | everything about the *current* hunt (see below) |
| `$huntMode` | `setup.HuntController` | top-level flag: NONE / ACTIVE / POSSESSED / ENDED |
| `$ectoplasm` / `$meta` | `setup.HuntController` / `setup.HuntShop` | meta-currency + permanent unlocks |
| `$wardrobe` | `setup.Wardrobe` | every garment as an item with worn/stolen/lost state |
| `$tools` | tool helpers | EMF + UV-light timers |
| `$hours` `$minutes` | `setup.Time` | the in-world clock |

Loading an old save? Defaults are filled in by
[passages/updates/SaveMigration.js](passages/updates/SaveMigration.js); one-shot
reshapings live in [passages/updates/Migrations.js](passages/updates/Migrations.js).

## The hunt loop (the heart of the game)

A "hunt" is one trip into a haunted house. `setup.HuntController` owns it:

- `$huntMode` is the lifecycle flag; prefer the predicates `isHunting()` /
  `isPossessed()` / `isEnded()` over comparing raw numbers.
- `$run` is the per-hunt bundle: the true `ghostName`, the procedurally
  generated `floorplan`, active `modifiers`, collected `evidence`, current room,
  loot, and so on. `endHunt()` settles the run and clears it; `$ectoplasm`
  survives to the meta-shop.

Lifecycle behavior is wired through a small **event bus**
([passages/hunt/Hunt.js](passages/hunt/Hunt.js)) instead of one giant function:

- `setup.Hunt.on(event, fn)` / `emit(event, ctx)` — fire-and-forget reactions.
- `setup.Hunt.filter(event, fn)` / `applyFilter(event, ctx)` — let a modifier or
  ghost *mutate* a value (a payout, a roll, an allowed-flag) without
  HuntController branching on every case.

So adding a per-modifier or per-ghost quirk means subscribing to an event, not
editing the core loop.

## Ghosts

The 18 ghost types are catalogue entries (`GHOST_CONFIG`) in
[passages/ghosts/GhostController.js](passages/ghosts/GhostController.js). A ghost
declares its evidence and hunt-gate, plus optional `huntHooks` (event reactions)
and `huntFilters` (effect overrides) that ride the hunt bus. Read the active
ghost through `setup.ActiveGhost.*` — never branch on `ghost.name`.

## "How do I…"

- **Add a screen?** Add a `:: PassageName` block in the right `passages/`
  subfolder; copy the tag list from a neighbor. The link checker
  (`tools/check_links.py`) and reachability checker make sure it's wired up.
- **Add a ghost?** Add a `GHOST_CONFIG` entry + a portrait under
  `assets/characters/ghosts/`; hooks/filters are picked up automatically.
- **Add a reusable UI bit?** Write a `<<widget>>` (or a `Macro.add` in JS) and
  register its tooltip in [config/t3lt.twee-config.yml](config/t3lt.twee-config.yml).
- **Add behavior to another subsystem?** Call its `setup.*` API — don't reach
  into its state variables directly.
- **Change something?** Add or update a test in `tests/` (unit-style specs at the
  root, end-to-end flows under `tests/e2e/`) and run `npm test`.

## Where to read next

- `plotlines/*.md` — the design intent behind each story arc.
- `tools/` — each linter's docstring explains a convention the code follows.
- The header comment at the top of any controller explains what it owns.
