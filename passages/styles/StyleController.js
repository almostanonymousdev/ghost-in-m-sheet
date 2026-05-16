/* Light/dark state stored on every haunt room object as `background`.
   Room state init sets it to DARK by default; widgetHauntedHouseRoom
   flips it via the lighton/lightoff link pair. Save format keeps the
   raw 1/2 numbers, so don't rename the values. */
setup.RoomLight = Object.freeze({
	LIT:  1,
	DARK: 2
});

/*
 * Centralized room background data and helpers.
 *
 * Before this controller existed, the same per-room facts were
 * repeated across the CSS classes in StoryStylesheet.tw, the
 * inline <style> blocks in widgetIncludeStyles.tw (twice: one chain
 * for previous(), one for previous(2)), and the
 * <<addclass>>/<<removeclass>> switch in LightPassageManual.tw.
 *
 * Every widget / passage that needs a room's light/dark asset,
 * body class, or "is this room currently dark?" flag now reads
 * from setup.Styles. Adding a new room means one entry here.
 */
setup.Styles = (function () {
	// stateKey:   State.variables[stateKey].background — 1 light, 2 dark
	// light/dark: background-image URLs for each state
	// cls:        base class name; "Light"/"Dark" is appended
	var rooms = {
		// --- Owaissa ---------------------------------------------
		OwaissaKitchen:    { stateKey: 'kitchen',    light: 'assets/scenes/room/kitchen.jpg',    dark: 'assets/scenes/room/kitchen-dark.jpg',    cls: 'owaissaKitchen' },
		OwaissaHallway:    { stateKey: 'hallway',    light: 'assets/scenes/room/hallway.jpg',    dark: 'assets/scenes/room/hallway-dark.jpg',    cls: 'owaissaHallway' },
		OwaissaBathroom:   { stateKey: 'bathroom',   light: 'assets/scenes/room/bathroom.jpg',   dark: 'assets/scenes/room/bathroom-dark.jpg',   cls: 'owaissaBathroom' },
		OwaissaBedroom:    { stateKey: 'bedroom',    light: 'assets/scenes/room/bedroom.jpg',    dark: 'assets/scenes/room/bedroom-dark.jpg',    cls: 'owaissaBedroom' },
		OwaissaLivingroom: { stateKey: 'livingroom', light: 'assets/scenes/room/livingroom.jpg', dark: 'assets/scenes/room/livingroom-dark.jpg', cls: 'owaissaLivingroom' },

		// --- Elm -------------------------------------------------
		ElmBasement:        { stateKey: 'basement',        light: 'assets/scenes/room/elm/basement.jpg',  dark: 'assets/scenes/room/elm/basement-dark.jpg',  cls: 'elmBasement' },
		ElmKitchen:         { stateKey: 'kitchen',         light: 'assets/scenes/room/elm/kitchen.jpg',   dark: 'assets/scenes/room/elm/kitchen-dark.jpg',   cls: 'elmKitchen' },
		ElmBathroom:        { stateKey: 'bathroom',        light: 'assets/scenes/room/elm/bathroom.jpg',  dark: 'assets/scenes/room/elm/bathroom-dark.jpg',  cls: 'elmBathroom' },
		ElmBathroomTwo:     { stateKey: 'bathroomTwo',     light: 'assets/scenes/room/elm/bathroom1.jpg', dark: 'assets/scenes/room/elm/bathroom1-dark.jpg', cls: 'elmBathroomTwo' },
		ElmBedroom:         { stateKey: 'bedroom',         light: 'assets/scenes/room/elm/bedroom.jpg',   dark: 'assets/scenes/room/elm/bedroom-dark.jpg',   cls: 'elmBedroom' },
		ElmBedroomTwo:      { stateKey: 'bedroomTwo',      light: 'assets/scenes/room/elm/bedroom1.jpg',  dark: 'assets/scenes/room/elm/bedroom1-dark.jpg',  cls: 'elmBedroomTwo' },
		ElmNursery:         { stateKey: 'nursery',         light: 'assets/scenes/room/elm/nursery.jpg',   dark: 'assets/scenes/room/elm/nursery-dark.jpg',   cls: 'elmNursery' },
		ElmHallway:         { stateKey: 'hallway',         light: 'assets/scenes/room/elm/hallway.jpg',   dark: 'assets/scenes/room/elm/hallway-dark.jpg',   cls: 'elmHallway' },
		ElmHallwayUpstairs: { stateKey: 'hallwayUpstairs', light: 'assets/scenes/room/elm/hallway1.jpg',  dark: 'assets/scenes/room/elm/hallway1-dark.jpg',  cls: 'elmHallwayTwo' },

		// --- Ironclad --------------------------------------------
		IroncladReception:   { stateKey: 'reception',   light: 'assets/scenes/room/ironclad/reception.webp',     dark: 'assets/scenes/room/ironclad/reception-dark.webp',     cls: 'IroncladReception' },
		IroncladKitchen:     { stateKey: 'kitchen',     light: 'assets/scenes/room/ironclad/kitchen.webp',       dark: 'assets/scenes/room/ironclad/kitchen-dark.webp',       cls: 'IroncladKitchen' },
		IroncladHallway:     { stateKey: 'hallway',     light: 'assets/scenes/room/ironclad/entrance.webp',      dark: 'assets/scenes/room/ironclad/entrance-dark.webp',      cls: 'IroncladHallway' },
		IroncladBlockA:      { stateKey: 'BlockA',      light: 'assets/scenes/room/ironclad/block-a.webp',       dark: 'assets/scenes/room/ironclad/block-a-dark.webp',       cls: 'IroncladBlockA' },
		IroncladBlockB:      { stateKey: 'BlockB',      light: 'assets/scenes/room/ironclad/block-b.webp',       dark: 'assets/scenes/room/ironclad/block-b-dark.webp',       cls: 'IroncladBlockB' },
		IroncladBlockACellA: { stateKey: 'BlockACellA', light: 'assets/scenes/room/ironclad/block-a-cell-a.webp', dark: 'assets/scenes/room/ironclad/block-a-cell-a-dark.webp', cls: 'IroncladBlockACellA' },
		IroncladBlockACellB: { stateKey: 'BlockACellB', light: 'assets/scenes/room/ironclad/block-a-cell-b.webp', dark: 'assets/scenes/room/ironclad/block-a-cell-b-dark.webp', cls: 'IroncladBlockACellB' },
		IroncladBlockACellC: { stateKey: 'BlockACellC', light: 'assets/scenes/room/ironclad/block-a-cell-c.webp', dark: 'assets/scenes/room/ironclad/block-a-cell-c-dark.webp', cls: 'IroncladBlockACellC' },
		IroncladBlockBCellA: { stateKey: 'BlockBCellA', light: 'assets/scenes/room/ironclad/block-b-cell-a.webp', dark: 'assets/scenes/room/ironclad/block-b-cell-a-dark.webp', cls: 'IroncladBlockBCellA' },
		IroncladBlockBCellB: { stateKey: 'BlockBCellB', light: 'assets/scenes/room/ironclad/block-b-cell-b.webp', dark: 'assets/scenes/room/ironclad/block-b-cell-b-dark.webp', cls: 'IroncladBlockBCellB' },
		IroncladBlockBCellC: { stateKey: 'BlockBCellC', light: 'assets/scenes/room/ironclad/block-b-cell-c.webp', dark: 'assets/scenes/room/ironclad/block-b-cell-c-dark.webp', cls: 'IroncladBlockBCellC' }
	};

	/* Hunt rooms render through the single HuntRun passage, so they
	   can't share the passage-name → room map above. Keyed by
	   setup.Templates id instead; setup.Styles.bgUrlForTemplate is the
	   sole reader. Adding a new procedurally-eligible template means
	   adding it here AND in setup.Templates. */
	var huntRooms = {
		// Hallway is the backbone (room_0).
		hallway:          { light: 'assets/scenes/room/hallway.jpg',             dark: 'assets/scenes/room/hallway-dark.jpg' },
		// Templates eligible for procedural plans; they reuse the
		// Owaissa/Elm scene art rather than ship procedural variants.
		kitchen:          { light: 'assets/scenes/room/kitchen.jpg',             dark: 'assets/scenes/room/kitchen-dark.jpg' },
		bathroom:         { light: 'assets/scenes/room/bathroom.jpg',            dark: 'assets/scenes/room/bathroom-dark.jpg' },
		bedroom:          { light: 'assets/scenes/room/bedroom.jpg',             dark: 'assets/scenes/room/bedroom-dark.jpg' },
		livingroom:       { light: 'assets/scenes/room/livingroom.jpg',          dark: 'assets/scenes/room/livingroom-dark.jpg' },
		nursery:          { light: 'assets/scenes/room/elm/nursery.jpg',         dark: 'assets/scenes/room/elm/nursery-dark.jpg' },
		basement:         { light: 'assets/scenes/room/elm/basement.jpg',        dark: 'assets/scenes/room/elm/basement-dark.jpg' },
		// Upstairs Elm templates -- not procedurally eligible
		// (procedural plans use a single hallway as the backbone), but
		// reachable via the static-plan 'elm' catalogue, which pins the
		// same hub-and-spoke layout the Elm passages use.
		hallwayUpstairs:  { light: 'assets/scenes/room/elm/hallway1.jpg',        dark: 'assets/scenes/room/elm/hallway1-dark.jpg' },
		bathroomTwo:      { light: 'assets/scenes/room/elm/bathroom1.jpg',       dark: 'assets/scenes/room/elm/bathroom1-dark.jpg' },
		bedroomTwo:       { light: 'assets/scenes/room/elm/bedroom1.jpg',        dark: 'assets/scenes/room/elm/bedroom1-dark.jpg' },
		// Ironclad templates -- not procedurally eligible (cellblock
		// layout is uniquely structural), but reachable via the
		// static-plan 'ironclad' catalogue. Reception, the two
		// cellblock hubs, and the six cells each get the same prison
		// art the IroncladReception / IroncladBlockA / etc. passages
		// use, so the body-background pipeline renders identical
		// scenery.
		reception:        { light: 'assets/scenes/room/ironclad/reception.webp',     dark: 'assets/scenes/room/ironclad/reception-dark.webp' },
		BlockA:           { light: 'assets/scenes/room/ironclad/block-a.webp',       dark: 'assets/scenes/room/ironclad/block-a-dark.webp' },
		BlockB:           { light: 'assets/scenes/room/ironclad/block-b.webp',       dark: 'assets/scenes/room/ironclad/block-b-dark.webp' },
		BlockACellA:      { light: 'assets/scenes/room/ironclad/block-a-cell-a.webp', dark: 'assets/scenes/room/ironclad/block-a-cell-a-dark.webp' },
		BlockACellB:      { light: 'assets/scenes/room/ironclad/block-a-cell-b.webp', dark: 'assets/scenes/room/ironclad/block-a-cell-b-dark.webp' },
		BlockACellC:      { light: 'assets/scenes/room/ironclad/block-a-cell-c.webp', dark: 'assets/scenes/room/ironclad/block-a-cell-c-dark.webp' },
		BlockBCellA:      { light: 'assets/scenes/room/ironclad/block-b-cell-a.webp', dark: 'assets/scenes/room/ironclad/block-b-cell-a-dark.webp' },
		BlockBCellB:      { light: 'assets/scenes/room/ironclad/block-b-cell-b.webp', dark: 'assets/scenes/room/ironclad/block-b-cell-b-dark.webp' },
		BlockBCellC:      { light: 'assets/scenes/room/ironclad/block-b-cell-c.webp', dark: 'assets/scenes/room/ironclad/block-b-cell-c-dark.webp' },
		// Procedural-only templates with dedicated backgrounds.
		attic:            { light: 'assets/scenes/room/attic-lit.jpg',           dark: 'assets/scenes/room/attic-dark.jpg' },
		'dining-room':    { light: 'assets/scenes/room/dining-room-lit.jpg',     dark: 'assets/scenes/room/dining-room-dark.jpg' },
		sauna:            { light: 'assets/scenes/room/sauna-lit.jpg',           dark: 'assets/scenes/room/sauna-dark.jpg' },
		'sex-dungeon':    { light: 'assets/scenes/room/sex-dungeon-lit.jpg',     dark: 'assets/scenes/room/sex-dungeon-dark.jpg' },
		'walk-in-closet': { light: 'assets/scenes/room/walk-in-closet-lit.jpg',  dark: 'assets/scenes/room/walk-in-closet-dark.jpg' }
	};

	function roomOf(passageName) {
		return rooms[passageName] || null;
	}

	function isDark(passageName) {
		var r = rooms[passageName];
		if (!r) return false;
		return setup.Rooms.isDark(r.stateKey);
	}

	return {
		rooms: rooms,
		huntRooms: huntRooms,
		roomOf: roomOf,
		isDarkRoom: isDark,

		/*
		 * Background image URL for the given room passage,
		 * resolved against the current light/dark state.
		 */
		bgUrl: function (passageName) {
			var r = rooms[passageName];
			if (!r) return null;
			return isDark(passageName) ? r.dark : r.light;
		},

		/*
		 * Background image URL for a hunt-room template.  Hunt rooms
		 * have no per-room light state, so callers pass `dark = true`
		 * explicitly when they want the dark variant. Returns null
		 * for templates without art.
		 *
		 * Optional `staticHouseId` lets a static-plan hunt house
		 * (setup.HuntHouses) override the global default with its
		 * own house art -- so 'elm's hallway pulls Elm's hallway.jpg
		 * instead of the Owaissa default and 'ironclad's hallway
		 * pulls the prison entrance.
		 */
		bgUrlForTemplate: function (templateId, dark, staticHouseId) {
			if (staticHouseId && setup.HuntHouses
					&& typeof setup.HuntHouses.backgroundOverride === 'function') {
				var override = setup.HuntHouses.backgroundOverride(staticHouseId, templateId);
				if (override) return dark ? override.dark : override.light;
			}
			var r = huntRooms[templateId];
			if (!r) return null;
			return dark ? r.dark : r.light;
		},

		/*
		 * Current body class ("owaissaKitchenLight" / "…Dark"),
		 * paired with the class that should be removed.
		 */
		classesFor: function (passageName) {
			var r = rooms[passageName];
			if (!r) return null;
			var dark = isDark(passageName);
			return {
				add:    r.cls + (dark ? 'Dark'  : 'Light'),
				remove: r.cls + (dark ? 'Light' : 'Dark')
			};
		},

		/*
		 * Shared shorthand for the inline body-background style
		 * block that the include* widgets write. Centralised here
		 * so the CSS can be tweaked in one place.
		 */
		bodyBackgroundCss: function (url) {
			return "body {"
				+ "background-image: url('" + url + "');"
				+ "background-size: cover;"
				+ "background-repeat: no-repeat;"
				+ "background-position: center;"
				+ "background-attachment: fixed;"
				+ "height: 100vh;"
				+ "}";
		},

		/*
		 * If the current passage is a known hunt room AND the room
		 * is currently lit, flip it dark and return the passage name
		 * so the caller can <<goto>> itself. Returns null when no
		 * change is made.
		 */
		turnOffLightHere: function () {
			var p = passage();
			var r = rooms[p];
			if (!r) return null;
			var s = setup.Rooms.byId(r.stateKey);
			if (!s || s.background !== setup.RoomLight.LIT) return null;
			s.background = setup.RoomLight.DARK;
			return p;
		}
	};
})();

/* Asset-path rewriters. Authors write `assets/foo.png` everywhere; at
 * runtime those paths are resolved against `setup.ImagePath` so the
 * release/dev builds can swap roots without touching passage source.
 * The :passagerender pass handles per-passage <style> blocks; the
 * :storyready pass handles the story-wide stylesheet on first paint. */
$(document).on(':passagerender', function (ev) {
	$(ev.content).find('style').each(function () {
		this.textContent = this.textContent.replace(
			/url\((['"]?)assets\//g,
			'url($1' + setup.ImagePath + '/'
		);
	});
});

$(document).one(':storyready', function () {
	var styles = document.querySelectorAll('style');
	styles.forEach(function (style) {
		if (style.textContent.indexOf('assets/') !== -1) {
			style.textContent = style.textContent.replace(
				/url\((['"]?)assets\//g,
				'url($1' + setup.ImagePath + '/'
			);
		}
	});
});

/* <<video path [classOrOpts]>> and <<image path [classOrOpts]>>
 *
 * Thin wrappers that resolve `setup.ImagePath` and emit the HTML that
 * authors would otherwise hand-write ~1300 times across the passages.
 *
 *   <<video "mechanics/tentacles/2.0.mp4">>                  autoplay controls loop, mp4/webm by ext (unmuted unless Settings toggle is on)
 *   <<video "characters/mc/bra-off.webm" "displayCentredImgs">>   string 2nd arg = class
 *   <<video "characters/mc/bra-off.webm" { controls: false, width: "40%" }>>
 *   <<image "ui/img/corruption.png">>
 *   <<image "characters/alice/alice.png" "companion-image">>
 *   <<image "ui/img/trash1.png" { id: "trash1", class: "trash", onclick: "..." }>>
 */
(function () {
	'use strict';

	function escAttr(v) {
		return String(v)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	/* SugarCube's macro argument parser tokenises `"foo" + _bar` and
	 * `"foo" { a: 1 }` into bare literal tokens (`+`, `{`, `}`, keys-with-
	 * trailing-colon, ...) rather than evaluating them, so the raw `args`
	 * array is unusable for call sites that rely on either pattern. When
	 * we detect that shape, scan the post-substitution `full` arg string
	 * to split path-expression from opts-expression and evaluate each
	 * half as JS — that way common author patterns work without having
	 * to remember backticks on every call. */
	function splitFullArgs(full) {
		var inStr = null, escape = false, depth = 0;
		var afterCompleteExpr = false;
		for (var i = 0; i < full.length; i++) {
			var c = full.charAt(i);
			if (escape) { escape = false; continue; }
			if (inStr) {
				if (c === '\\') { escape = true; continue; }
				if (c === inStr) {
					inStr = null;
					if (depth === 0) afterCompleteExpr = true;
				}
				continue;
			}
			if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
			if (c === '"' || c === "'" || c === '`') {
				if (afterCompleteExpr && depth === 0) {
					return { pathText: full.slice(0, i).trim(), optsText: full.slice(i).trim() };
				}
				inStr = c;
				continue;
			}
			if (c === '{') {
				if (afterCompleteExpr && depth === 0) {
					return { pathText: full.slice(0, i).trim(), optsText: full.slice(i).trim() };
				}
				depth++;
				afterCompleteExpr = false;
				continue;
			}
			if (c === '(' || c === '[') { depth++; afterCompleteExpr = false; continue; }
			if (c === ')' || c === ']' || c === '}') {
				depth--;
				if (depth === 0) afterCompleteExpr = true;
				continue;
			}
			if ('-+*/%,.&|!?<>=^~:'.indexOf(c) >= 0) {
				afterCompleteExpr = false;
				continue;
			}
			afterCompleteExpr = true;
		}
		return { pathText: full.trim(), optsText: null };
	}

	function resolveOpts(ctx, macroName) {
		var args = ctx.args;
		if (args.length < 1) {
			return { error: '<<' + macroName + '>> requires a non-empty path string as the first argument.' };
		}

		var needsFullParse = false;
		for (var k = 0; k < args.length; k++) {
			if (args[k] === '+' || args[k] === '{' || args[k] === '}') {
				needsFullParse = true;
				break;
			}
		}

		if (needsFullParse) {
			var split = splitFullArgs(args.full);
			try {
				var p = Scripting.evalJavaScript('(' + split.pathText + ')');
				var opts = {};
				if (split.optsText) {
					var v = Scripting.evalJavaScript('(' + split.optsText + ')');
					if (typeof v === 'string') {
						opts.class = v;
					} else if (v && typeof v === 'object') {
						opts = v;
					}
				}
				if (typeof p !== 'string' || !p) {
					return { error: '<<' + macroName + '>> path expression did not resolve to a non-empty string.' };
				}
				return { path: p, opts: opts };
			} catch (e) {
				return { error: '<<' + macroName + '>> failed to parse arguments: ' + e.message };
			}
		}

		if (typeof args[0] !== 'string' || !args[0]) {
			return { error: '<<' + macroName + '>> requires a non-empty path string as the first argument.' };
		}
		var opts2 = {};
		var second = args[1];
		if (typeof second === 'string') {
			opts2.class = second;
		} else if (second && typeof second === 'object') {
			opts2 = second;
		}
		return { path: args[0], opts: opts2 };
	}

	function resolveSrc(path) {
		// Strip any leading slashes so we always produce exactly one between
		// ImagePath and the author-supplied path.
		return setup.ImagePath + '/' + String(path).replace(/^\/+/, '');
	}

	Macro.add('video', {
		handler: function () {
			var r = resolveOpts(this, 'video');
			if (r.error) return this.error(r.error);

			var opts = r.opts;
			var autoplay = opts.autoplay !== false;
			var controls = opts.controls !== false;
			/* `muted` defaults off so videos play with sound; callers
			   opt in with `{ muted: true }`. The Settings-dialog
			   toggle forces it on globally and overrides any per-call
			   value, so a player who flips it on silences everything. */
			var muted    = opts.muted === true || settings.muteAllVideos;
			var loop     = opts.loop     !== false;

			var type = opts.type;
			if (!type) {
				type = /\.webm$/i.test(r.path) ? 'video/webm' : 'video/mp4';
			}

			var attrs = [];
			if (autoplay) attrs.push('autoplay');
			if (controls) attrs.push('controls');
			if (muted)    attrs.push('muted');
			if (loop)     attrs.push('loop');
			if (opts.class) attrs.push('class="' + escAttr(opts.class) + '"');
			if (opts.id)    attrs.push('id="' + escAttr(opts.id) + '"');
			if (opts.width) attrs.push('width="' + escAttr(opts.width) + '"');
			if (opts.style) attrs.push('style="' + escAttr(opts.style) + '"');

			var html =
				'<video ' + attrs.join(' ') + '>' +
				'<source src="' + escAttr(resolveSrc(r.path)) + '" type="' + escAttr(type) + '">' +
				'</video>';
			$(this.output).append(html);
		}
	});

	Macro.add('image', {
		handler: function () {
			var r = resolveOpts(this, 'image');
			if (r.error) return this.error(r.error);

			var opts = r.opts;
			var attrs = ['src="' + escAttr(resolveSrc(r.path)) + '"'];
			if (opts.class)   attrs.push('class="' + escAttr(opts.class) + '"');
			if (opts.id)      attrs.push('id="' + escAttr(opts.id) + '"');
			if (opts.width)   attrs.push('width="' + escAttr(opts.width) + '"');
			if (opts.height)  attrs.push('height="' + escAttr(opts.height) + '"');
			if (opts.style)   attrs.push('style="' + escAttr(opts.style) + '"');
			if (opts.alt)     attrs.push('alt="' + escAttr(opts.alt) + '"');
			if (opts.onclick) attrs.push('onclick="' + escAttr(opts.onclick) + '"');

			$(this.output).append('<img ' + attrs.join(' ') + '>');
		}
	});
}());
