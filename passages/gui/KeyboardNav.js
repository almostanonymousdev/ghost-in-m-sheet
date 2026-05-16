/*
 * KeyboardNav — number-key choice selection + sidebar letter shortcuts.
 *
 * In-passage links are auto-numbered 1..9,0 by priority class
 * (.movebtn → .backbtn → .enterbtn → .usebtn → .alertbtn → unclassed),
 * then DOM order. Hold Alt to reveal the badges; tap a number to click.
 *
 * Sidebar HUD links (Bag/Notebook/Evidence/Phone/Guide/ChangeLog) get
 * dedicated letter shortcuts so they never collide with passage numbers.
 *
 * Modal-style passages (Notebook, Phone, Wardrobe, etc.) are skipped —
 * those screens have their own grids and rely on Tab/arrow navigation.
 *
 * Mutation observer scoped to #passages keeps the keymap fresh after
 * <<linkreplace>> rewrites, hunt-mode sidebar redraws, etc.
 */
setup.KeyboardNav = (function () {
	"use strict";

	// Priority order: lower index = lower number key.
	var PRIORITY_CLASSES = ["movebtn", "backbtn", "enterbtn", "usebtn", "alertbtn"];

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
	// is in an input). 'v' for Evidence — 'e' is reserved for future use.
	var SIDEBAR_BINDINGS = [
		{ passage: "Bag",       key: "b" },
		{ passage: "Notebook",  key: "n" },
		{ passage: "Evidence",  key: "v" },
		{ passage: "Phone",     key: "p" },
		{ passage: "Guide",     key: "g" },
		{ passage: "ChangeLog", key: "l" }
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

	function priorityFor(el) {
		var cur = el;
		while (cur && cur.nodeType === 1 && cur !== document.body) {
			var cl = cur.classList;
			if (cl) {
				for (var i = 0; i < PRIORITY_CLASSES.length; i++) {
					if (cl.contains(PRIORITY_CLASSES[i])) return i;
				}
			}
			cur = cur.parentElement;
		}
		return PRIORITY_CLASSES.length; // unclassed: lowest priority
	}

	function isLinkVisible(el) {
		if (!el || !el.isConnected) return false;
		if (el.classList.contains("disabled-link")) return false;
		if (el.classList.contains("no-hotkey")) return false;
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
		if (isModal()) return;

		var links = Array.prototype.slice.call(root.querySelectorAll("a"));
		var eligible = [];
		for (var i = 0; i < links.length; i++) {
			if (isLinkVisible(links[i])) eligible.push({ el: links[i], idx: i, p: priorityFor(links[i]) });
		}
		eligible.sort(function (a, b) {
			if (a.p !== b.p) return a.p - b.p;
			return a.idx - b.idx;
		});

		for (var j = 0; j < eligible.length && j < NUMBER_KEYS.length; j++) {
			var k = NUMBER_KEYS[j];
			var el = eligible[j].el;
			el.setAttribute("data-hotkey", k);
			numberMap[k] = el;
		}
	}

	function assignSidebarHotkeys() {
		clearAttr(letterMap, "data-hotkey-letter");
		letterMap = Object.create(null);

		var bar = document.getElementById("ui-bar");
		if (!bar) return;

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

	// --- Key handling -----------------------------------------------

	function isTypingTarget(el) {
		if (!el) return false;
		var tag = (el.tagName || "").toLowerCase();
		if (tag === "input" || tag === "textarea" || tag === "select") return true;
		if (el.isContentEditable) return true;
		return false;
	}

	function onKeyDown(ev) {
		// Alt reveals the hotkey badges. preventDefault() suppresses
		// Firefox's "focus the menu bar on Alt-hold" behavior; the
		// matching keyup handler suppresses Chrome/Edge's release-pop.
		// Other modifier combos (Ctrl+Alt, Shift+Alt, OS-level Alt+Tab)
		// pass through untouched, and we never swallow keys while
		// typing into an input.
		if (ev.key === "Alt" && !ev.ctrlKey && !ev.shiftKey && !ev.metaKey) {
			document.body.classList.add("show-hotkeys");
			if (!isTypingTarget(ev.target)) ev.preventDefault();
			return;
		}
		// Meta (Cmd on macOS, Win key on Windows) is the second reveal
		// trigger — Mac users tend to reach for Cmd before Option.
		// We do NOT preventDefault here: Cmd+R / Cmd+S / Cmd+W are all
		// real browser shortcuts and must keep working.
		if (ev.key === "Meta" && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
			document.body.classList.add("show-hotkeys");
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
			document.body.classList.remove("show-hotkeys");
			// Mirror the keydown suppression — Chrome/Edge trigger the
			// menu on Alt-release rather than Alt-hold.
			if (!isTypingTarget(ev.target)) ev.preventDefault();
		} else if (ev.key === "Meta") {
			document.body.classList.remove("show-hotkeys");
		}
	}

	function onBlur() {
		document.body.classList.remove("show-hotkeys");
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
			try { ls.setItem(HINT_STORAGE_KEY, "seen"); } catch (e) {}
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

		$(document).on(":passagedisplay", scheduleRefresh);

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
		// Test hooks — read-only views of the live maps.
		_numberHotkeys: function () {
			return Object.keys(numberMap).map(function (k) {
				return { key: k, text: (numberMap[k].textContent || "").trim() };
			});
		},
		_letterHotkeys: function () {
			return Object.keys(letterMap).map(function (k) {
				return { key: k, passage: letterMap[k].getAttribute("data-passage") };
			});
		}
	};
})();
