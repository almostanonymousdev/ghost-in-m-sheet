/*
 * KeyboardNav — number-key choice selection + sidebar letter shortcuts.
 *
 * In-passage links are auto-numbered 1..9,0 in visual reading order
 * (top-to-bottom, then left-to-right via getBoundingClientRect). Hold
 * Alt to reveal the badges; tap a number to click. Three carve-outs:
 *   - Hunt-nav links (.huntNavLink, stamped on the HuntRun room exits)
 *     are pinned to the front of the number list so the top exit is
 *     always 1 and they increment down regardless of where they
 *     visually sit relative to other choices in the passage.
 *   - Back / return buttons (.backbtn) get the "esc" letter badge
 *     instead of a number — Escape already triggers them globally.
 *   - Tool anchors (any <a> under an ancestor with [data-tool]) get
 *     their permanent search-tool letter (t/f/g/u/e/s, from
 *     setup.searchToolKeyMap) and are excluded from numbering. The
 *     tool key handler in ToolController owns the actual click.
 *
 * Sidebar HUD links (Bag/Notebook/Evidence/Phone/Guide/ChangeLog) get
 * dedicated letter shortcuts so they never collide with passage numbers.
 * In-passage letter shortcuts (the hunt's lights-on/off, plus the tool
 * badges above) use the same render path; the Mutation observer keeps
 * both fresh.
 *
 * The "always show keyboard shortcuts" setting flips the Alt behavior:
 * with it off (default), Alt held REVEALS badges; with it on, badges
 * are visible by default and Alt held HIDES them. See
 * applyHotkeyVisibility / revealHeld below.
 *
 * Modal-style passages (Notebook, Phone, Wardrobe, etc.) are skipped —
 * those screens have their own grids and rely on Tab/arrow navigation.
 * Back / tool badges still stamp on modal passages so Escape and the
 * tool keys keep working there.
 *
 * Mutation observer scoped to #passages keeps the keymap fresh after
 * <<linkreplace>> rewrites, hunt-mode sidebar redraws, etc.
 */
setup.KeyboardNav = (function () {
	"use strict";

	// Two classes still need special handling. Everything else sorts
	// by visual position via getBoundingClientRect.
	//   - .backbtn loses its number slot to the "esc" letter badge.
	//   - .huntNavLink is pinned to the front of the number list so
	//     HuntRun's room-exit stack always starts at 1 and increments
	//     down (the hunt nav lives in a fixed bottom-right column, so
	//     pure reading order would push it past every passage-body
	//     link that visually sits above it).
	var BACK_CLASS = "backbtn";
	var HUNT_NAV_CLASS = "huntNavLink";

	// Passages whose content is a custom grid (Notebook checkboxes, Phone
	// contact tiles, Wardrobe slots, etc.). On these we leave number keys
	// alone — the screen is meant to be Tab/arrow driven.
	var MODAL_PASSAGES = Object.freeze({
		Bag: true,
		Notebook: true,
		Evidence: true,
		Phone: true,
		Wardrobe: true,
		Guide: true,
		ChangeLog: true,
		BodyModification: true,
		Mirror: true
	});

	var NUMBER_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

	// Sidebar letter bindings. Letters were picked to avoid clashing with
	// any reasonable in-game typing context (we already skip when focus
	// is in an input) AND with the in-hunt search-tool keys defined in
	// ToolController (setup.searchToolKeyMap: t/f/g/u/e/s). 'v' for
	// Evidence — 'e' would collide with the Plasmometer; 'a' for Guide —
	// 'g' would collide with GWB.
	var SIDEBAR_BINDINGS = [
		{ passage: "Bag", key: "b" },
		{ passage: "Notebook", key: "n" },
		{ passage: "Evidence", key: "v" },
		{ passage: "Phone", key: "p" },
		{ passage: "Guide", key: "a" },
		{ passage: "ChangeLog", key: "y" }
	];

	// In-passage letter bindings. Selector is rooted at #passages and
	// the first visible match is bound. Used for hunt-run lights so the
	// player can flip them without reaching for the mouse — see the
	// .kbnav-light-on / .kbnav-light-off spans in widgetHuntFooterLight.
	// `c` is reserved for the companion-card portrait link in the
	// HuntRun toolbar (CompanionMain / CompanionFailed / CompanionSucceeded,
	// whichever the widget renders this tick — same anchor class).
	var PASSAGE_BINDINGS = [
		{ selector: ".kbnav-light-on a", key: "l" },
		{ selector: ".kbnav-light-off a", key: "o" },
		{ selector: "a.companion-card-link", key: "c" }
	];

	var HINT_STORAGE_KEY = "ghost-keynav-hint";
	var HINT_AUTO_DISMISS_MS = 12000;

	var numberMap = Object.create(null);   // "1" → <a>
	var letterMap = Object.create(null);   // "b" → <a>
	var refreshScheduled = false;

	function currentPassageName() {
		try { return typeof passage === "function" ? passage() : ""; }
		catch (e) { return ""; }
	}

	function isModal() {
		return MODAL_PASSAGES[currentPassageName()] === true;
	}

	function hasAncestorClass(el, className) {
		var cur = el;
		while (cur && cur.nodeType === 1 && cur !== document.body) {
			if (cur.classList && cur.classList.contains(className)) return true;
			cur = cur.parentElement;
		}
		return false;
	}

	// Returns the permanent search-tool letter for an anchor that sits
	// under a [data-tool] ancestor (in-room <<searchTool>> button OR
	// hunt-tool-card-label), or null when the link isn't a tool slot.
	// The data-tool value is the canonical tool key (emf/uvl/...); we
	// reverse-look-up the letter in setup.searchToolKeyMap so this
	// stays driven by a single source of truth.
	function toolLetterFor(el) {
		var cur = el, tool = null;
		while (cur && cur.nodeType === 1 && cur !== document.body) {
			if (cur.getAttribute) {
				var t = cur.getAttribute("data-tool");
				if (t) { tool = t; break; }
			}
			cur = cur.parentElement;
		}
		if (!tool) return null;
		var map = setup.searchToolKeyMap;
		if (!map) return null;
		for (var k in map) {
			if (map.hasOwnProperty(k) && map[k] === tool) return k;
		}
		return null;
	}

	// True if the link (or any ancestor) is in a disabled state.
	// Covers .disabled-link / .disabled-linkSpecial classes, the
	// aria-disabled="true" attribute, and the native [disabled]
	// attribute. The class checks must walk ancestors because the
	// .disabled-link class is typically added to the link's parent
	// span (the <<addclass ".cardlink" "disabled-link">> pattern),
	// not the <a> itself.
	function isAncestorDisabled(el) {
		var cur = el;
		while (cur && cur.nodeType === 1 && cur !== document.body) {
			var cl = cur.classList;
			if (cl && (cl.contains("disabled-link") || cl.contains("disabled-linkSpecial"))) return true;
			if (cur.getAttribute) {
				if (cur.getAttribute("aria-disabled") === "true") return true;
				if (cur.hasAttribute("disabled")) return true;
			}
			cur = cur.parentElement;
		}
		return false;
	}

	function isLinkVisible(el) {
		if (!el || !el.isConnected) return false;
		if (el.classList.contains("no-hotkey")) return false;
		if (isAncestorDisabled(el)) return false;
		// Walk ancestors looking for display:none. Avoid getComputedStyle
		// where possible — it forces layout. We only care about a coarse
		// "is this in a hidden subtree" signal; opacity/visibility are
		// fine to leave clickable.
		var cur = el;
		while (cur && cur !== document.body && cur !== document) {
			if (cur.nodeType === 1 && cur.style && cur.style.display === "none") return false;
			cur = cur.parentNode;
		}
		return true;
	}

	function findBackLink() {
		var root = document.getElementById("passages");
		if (!root) return null;
		var candidates = root.querySelectorAll(".backbtn a, a.backbtn");
		for (var i = 0; i < candidates.length; i++) {
			if (isLinkVisible(candidates[i])) return candidates[i];
		}
		return null;
	}

	function clearAttr(map, attr) {
		Object.keys(map).forEach(function (k) {
			var el = map[k];
			if (el && el.removeAttribute) el.removeAttribute(attr);
		});
	}

	function assignPassageHotkeys() {
		clearAttr(numberMap, "data-hotkey");
		numberMap = Object.create(null);

		var root = document.getElementById("passages");
		if (!root) return;

		// Wipe stale letter badges from the previous render — they're
		// re-stamped below for links that still qualify, but anchors
		// that lost their .backbtn / [data-tool] ancestor (or
		// disappeared entirely) shouldn't keep the old badge. We only
		// touch badges we control ("esc" for backbtn + the tool keys
		// from setup.searchToolKeyMap); sidebar HUD letters (b/n/v/p/
		// a/y) and the in-passage light shortcuts (l/o) are owned by
		// assignSidebarHotkeys.
		var toolKeys = setup.searchToolKeyMap ? Object.keys(setup.searchToolKeyMap) : [];
		var stamped = ["esc"].concat(toolKeys);
		stamped.forEach(function (letter) {
			Array.prototype.forEach.call(
				root.querySelectorAll('a[data-hotkey-letter="' + letter + '"]'),
				function (a) { a.removeAttribute("data-hotkey-letter"); }
			);
		});

		// Back-buttons get the "esc" badge instead of a number. Escape
		// is already wired up to the first visible backbtn by the
		// global keydown handler. Tool anchors (anything under a
		// [data-tool] ancestor) get their permanent search-tool letter
		// and are skipped from numbering — the tool key handler in
		// ToolController owns the click. Both stamp even on modal
		// passages so Escape and the tool keys keep working there.
		var modal = isModal();
		var links = Array.prototype.slice.call(root.querySelectorAll("a"));
		var huntNav = [];
		var rest = [];
		for (var i = 0; i < links.length; i++) {
			var el = links[i];
			if (!isLinkVisible(el)) continue;
			if (hasAncestorClass(el, BACK_CLASS)) {
				el.setAttribute("data-hotkey-letter", "esc");
				continue;
			}
			var letter = toolLetterFor(el);
			if (letter) {
				el.setAttribute("data-hotkey-letter", letter);
				continue;
			}
			if (modal) continue;
			var rect = el.getBoundingClientRect();
			var entry = {
				el: el,
				idx: i,
				// Round to whole pixels so sub-pixel layout drift doesn't
				// split a row that's visually flat.
				top: Math.round(rect.top),
				left: Math.round(rect.left)
			};
			if (hasAncestorClass(el, HUNT_NAV_CLASS)) huntNav.push(entry);
			else rest.push(entry);
		}
		// Reading order: top-to-bottom, then left-to-right within a row,
		// with DOM order as the final tiebreaker for elements that share
		// the exact same rounded rect (e.g. inline links with no layout).
		var byReadingOrder = function (a, b) {
			if (a.top !== b.top) return a.top - b.top;
			if (a.left !== b.left) return a.left - b.left;
			return a.idx - b.idx;
		};
		huntNav.sort(byReadingOrder);
		rest.sort(byReadingOrder);
		// Hunt-nav links claim the front of the number list so the top
		// HuntRun exit is always 1; everything else falls into the
		// remaining slots in pure reading order.
		var eligible = huntNav.concat(rest);

		for (var j = 0; j < eligible.length && j < NUMBER_KEYS.length; j++) {
			var k = NUMBER_KEYS[j];
			var elem = eligible[j].el;
			elem.setAttribute("data-hotkey", k);
			numberMap[k] = elem;
		}
	}

	function assignSidebarHotkeys() {
		clearAttr(letterMap, "data-hotkey-letter");
		letterMap = Object.create(null);

		var bar = document.getElementById("ui-bar");
		if (bar) {
			SIDEBAR_BINDINGS.forEach(function (b) {
				// Two flavors of sidebar link: <a data-passage="..."> (the
				// raw icon anchors) and SugarCube's wikified [[Guide|Guide]]
				// which renders as <a class="link-internal" data-passage="...">.
				var el = bar.querySelector('a[data-passage="' + b.passage + '"]');
				if (!el || !isLinkVisible(el)) return;
				el.setAttribute("data-hotkey-letter", b.key);
				letterMap[b.key] = el;
			});
		}

		var root = document.getElementById("passages");
		if (root) {
			PASSAGE_BINDINGS.forEach(function (b) {
				var el = root.querySelector(b.selector);
				if (!el || !isLinkVisible(el)) return;
				el.setAttribute("data-hotkey-letter", b.key);
				letterMap[b.key] = el;
			});
		}
	}

	function refresh() {
		assignPassageHotkeys();
		assignSidebarHotkeys();
	}

	function scheduleRefresh() {
		if (refreshScheduled) return;
		refreshScheduled = true;
		var run = function () { refreshScheduled = false; refresh(); };
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
		else setTimeout(run, 16);
	}

	// --- Reveal state -----------------------------------------------
	// `body.show-hotkeys` is the visible toggle. The visible state is
	// `alwaysShown XOR revealHeld`: with the always-show setting off
	// (the default), Alt/Meta held adds the class; with the setting on,
	// the class is on by default and Alt/Meta held REMOVES it (the
	// "hold to hide" inversion the setting promises).

	var revealHeld = false;
	function isAlwaysShown() {
		try { return typeof settings !== "undefined" && !!settings.alwaysShowHotkeys; }
		catch (e) { return false; }
	}
	function applyHotkeyVisibility() {
		var show = isAlwaysShown() !== revealHeld;
		if (document.body) document.body.classList.toggle("show-hotkeys", show);
	}
	function setRevealHeld(v) {
		revealHeld = !!v;
		applyHotkeyVisibility();
	}

	// --- Key handling -----------------------------------------------

	function isTypingTarget(el) {
		if (!el) return false;
		var tag = (el.tagName || "").toLowerCase();
		if (tag === "input" || tag === "textarea" || tag === "select") return true;
		if (el.isContentEditable) return true;
		return false;
	}

	function onKeyDown(ev) {
		// Alt toggles the hotkey badges via revealHeld — with the
		// always-show setting off it reveals them, with the setting on
		// it hides them (see applyHotkeyVisibility). preventDefault()
		// suppresses Firefox's "focus the menu bar on Alt-hold"
		// behavior; the matching keyup handler suppresses Chrome/Edge's
		// release-pop. Other modifier combos (Ctrl+Alt, Shift+Alt,
		// OS-level Alt+Tab) pass through untouched, and we never
		// swallow keys while typing into an input.
		if (ev.key === "Alt" && !ev.ctrlKey && !ev.shiftKey && !ev.metaKey) {
			setRevealHeld(true);
			if (!isTypingTarget(ev.target)) ev.preventDefault();
			return;
		}
		// Meta (Cmd on macOS, Win key on Windows) is the second reveal
		// trigger — Mac users tend to reach for Cmd before Option.
		// We do NOT preventDefault here: Cmd+R / Cmd+S / Cmd+W are all
		// real browser shortcuts and must keep working.
		if (ev.key === "Meta" && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
			setRevealHeld(true);
			return;
		}
		if (isTypingTarget(ev.target)) return;
		if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
		if (isDialogOpen()) return; // SugarCube dialogs handle their own keys

		// Escape backs out via the passage's .backbtn link. Works on
		// modal screens (Bag/Notebook/etc., where number keys are
		// intentionally not assigned) as well as regular passages.
		if (ev.key === "Escape") {
			var back = findBackLink();
			if (back) {
				ev.preventDefault();
				back.click();
			}
			return;
		}

		var key = ev.key;
		var target = numberMap[key];
		if (target) {
			ev.preventDefault();
			target.click();
			return;
		}
		var letter = key.length === 1 ? key.toLowerCase() : key;
		target = letterMap[letter];
		if (target) {
			ev.preventDefault();
			target.click();
		}
	}

	function onKeyUp(ev) {
		if (ev.key === "Alt") {
			setRevealHeld(false);
			// Mirror the keydown suppression — Chrome/Edge trigger the
			// menu on Alt-release rather than Alt-hold.
			if (!isTypingTarget(ev.target)) ev.preventDefault();
		} else if (ev.key === "Meta") {
			setRevealHeld(false);
		}
	}

	function onBlur() {
		setRevealHeld(false);
	}

	function isDialogOpen() {
		// SugarCube sets body.ui-dialog-open while a dialog is on screen.
		// Cheats / Saves / Settings open through this path, and we don't
		// want our key handler stealing digits from them.
		return document.body.classList.contains("ui-dialog-open");
	}

	// --- First-load hint ---------------------------------------------

	function maybeShowFirstHint() {
		var ls;
		try { ls = window.localStorage; } catch (e) { return; }
		if (!ls) return;
		try { if (ls.getItem(HINT_STORAGE_KEY) === "seen") return; } catch (e) { return; }

		var hint = document.createElement("div");
		hint.id = "kbnav-hint";
		hint.setAttribute("role", "status");
		hint.innerHTML =
			'<span>Tip: press <b>1</b>–<b>9</b> to pick choices. ' +
			'Hold <b>Alt</b> to see the keys.</span>' +
			'<button type="button" class="kbnav-hint-close" aria-label="Dismiss">×</button>';

		function dismiss() {
			try { ls.setItem(HINT_STORAGE_KEY, "seen"); } catch (e) { }
			if (hint.parentNode) hint.parentNode.removeChild(hint);
		}
		hint.querySelector(".kbnav-hint-close").addEventListener("click", dismiss);
		document.body.appendChild(hint);
		setTimeout(dismiss, HINT_AUTO_DISMISS_MS);
	}

	// --- Init --------------------------------------------------------

	function init() {
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);

		applyHotkeyVisibility();
		$(document).on(":passagedisplay", scheduleRefresh);
		// Engine.play wipes document.body.className on every passage
		// navigation, dropping `show-hotkeys` along with it. Re-apply
		// on each :passagestart so the always-show setting persists
		// across navigation. Mirrors what GuiController does for
		// `show-history`.
		$(document).on(":passagestart", applyHotkeyVisibility);

		// <<linkreplace>> rewrites a link's text in place — same DOM node,
		// new children. Hunt-mode sidebar wardrobe also re-renders
		// #statusContainer. Observe the whole passage subtree and
		// re-derive the keymap whenever it changes.
		var root = document.getElementById("passages");
		if (root && typeof MutationObserver !== "undefined") {
			var mo = new MutationObserver(scheduleRefresh);
			mo.observe(root, { childList: true, subtree: true });
		}
		var bar = document.getElementById("ui-bar-body");
		if (bar && typeof MutationObserver !== "undefined") {
			var mo2 = new MutationObserver(scheduleRefresh);
			mo2.observe(bar, { childList: true, subtree: true });
		}

		refresh();
		maybeShowFirstHint();
	}

	$(document).one(":storyready", init);

	return {
		refresh: refresh,
		applyHotkeyVisibility: applyHotkeyVisibility,
		// Test hooks — read-only views of the live maps.
		_numberHotkeys: function () {
			return Object.keys(numberMap).map(function (k) {
				return { key: k, text: (numberMap[k].textContent || "").trim() };
			});
		},
		_letterHotkeys: function () {
			return Object.keys(letterMap).map(function (k) {
				return {
					key: k,
					passage: letterMap[k].getAttribute("data-passage"),
					classes: letterMap[k].parentElement
						? (letterMap[k].parentElement.className || "")
						: ""
				};
			});
		}
	};
})();

Setting.addToggle("alwaysShowHotkeys", {
	label: "Always show keyboard shortcuts (hold Alt to hide)",
	default: false,
	onChange: function () { setup.KeyboardNav.applyHotkeyVisibility(); }
});
