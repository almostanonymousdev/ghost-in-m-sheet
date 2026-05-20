/*
 * Hunt view-layer helpers: minimap, current-room denormalisation,
 * loot/furniture label humanisers.
 *
 * Split out of HuntController so the lifecycle file isn't carrying
 * SVG-string-building code. None of these helpers mutate $run; they
 * read the active run through setup.HuntController.active() and
 * compose into view structures the minimap widget and HuntRun consume.
 * Backwards compat with existing call sites is preserved by splicing
 * the helpers back onto setup.HuntController at the bottom -- passages
 * and tests keep calling setup.HuntController.minimapSvg() / etc.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntM).
 */
setup.HuntMinimap = (function () {
	function active() {
		return setup.HuntController && setup.HuntController.active
			? setup.HuntController.active() : null;
	}

	/* View-layer summary of the active run's floor plan, denormalised
	   for the minimap / room-list widget. Returns one record per
	   room with its template label, spawn/boss flags, any loot kinds
	   living on it, the BFS position for map layout, and the list of
	   neighbouring room ids. Null when no run is active. */
	function minimapData() {
		var run = active();
		if (!run || !run.floorplan) return null;
		var fp = run.floorplan;
		var lootByRoom = {};
		Object.keys(fp.loot || {}).forEach(function (kind) {
			var room = fp.loot[kind];
			if (!room) return;
			if (!lootByRoom[room]) lootByRoom[room] = [];
			lootByRoom[room].push(kind);
		});
		var positions = setup.FloorPlan.layout(fp);
		return fp.rooms.map(function (r) {
			var t = (setup.Templates && setup.Templates.byId)
				? setup.Templates.byId(r.template) : null;
			return {
				id: r.id,
				template: r.template,
				label: t ? t.label : r.template,
				isSpawn: r.id === fp.spawnRoomId,
				isBoss: r.id === fp.bossRoomId,
				lootKinds: lootByRoom[r.id] || [],
				position: positions[r.id] || { col: 0, row: 0 },
				connections: setup.FloorPlan.neighborsOf(fp, r.id)
			};
		});
	}

	/* Per-session UI flag: when the player clicks the minimap it
	   collapses to a small top-left thumbnail; clicking again expands.
	   Module-level so the choice survives passage re-renders (room
	   navigation rebuilds HuntRun, which would otherwise pop the map
	   back to full size every step). Reset on Event.END so a fresh run
	   always starts expanded. */
	var minimapCollapsed = false;
	function isMinimapCollapsed() { return minimapCollapsed; }
	function toggleMinimapCollapsed() {
		minimapCollapsed = !minimapCollapsed;
		return minimapCollapsed;
	}

	/* Build the hunt minimap as an inline SVG: one labeled rect per
	   room, one line per edge. Layout comes from setup.FloorPlan.layout
	   (BFS depth -> column, sibling order -> row). The current room is
	   tagged for highlighting; spawn/boss rooms get marker classes the
	   stylesheet tints. Returns an empty string when no run is active. */
	function minimapSvg() {
		var run = active();
		if (!run || !run.floorplan) return '';
		var fp = run.floorplan;
		var positions = setup.FloorPlan.layout(fp);
		var CELL_W = 110, CELL_H = 70, ROOM_W = 90, ROOM_H = 50, PAD = 10;

		// Canvas dims: span the right-most col and the deepest row used.
		var maxCol = 0, maxRow = 0;
		Object.keys(positions).forEach(function (id) {
			if (positions[id].col > maxCol) maxCol = positions[id].col;
			if (positions[id].row > maxRow) maxRow = positions[id].row;
		});
		var w = (maxCol + 1) * CELL_W + PAD * 2;
		var h = (maxRow + 1) * CELL_H + PAD * 2;

		function center(id) {
			var p = positions[id] || { col: 0, row: 0 };
			return {
				x: PAD + p.col * CELL_W + ROOM_W / 2,
				y: PAD + p.row * CELL_H + ROOM_H / 2
			};
		}
		function escapeXml(s) {
			return String(s)
				.replace(/&/g, '&amp;').replace(/</g, '&lt;')
				.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		}

		// Edges first so rooms render on top of the lines.
		var seen = {};
		var lines = [];
		(fp.edges || []).forEach(function (e) {
			var key = e[0] < e[1] ? e[0] + '--' + e[1] : e[1] + '--' + e[0];
			if (seen[key]) return;
			seen[key] = true;
			var a = center(e[0]), b = center(e[1]);
			lines.push('<line class="hunt-minimap-edge" x1="' + a.x +
				'" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>');
		});

		// Rooms.
		var currentId = run.currentRoomId || 'room_0';
		/* Loot Sense: rooms with at least one uncollected loot kind get
		   the hunt-minimap-loot class. Re-checks collectedLoot per
		   render so a slot the player just emptied stops glowing on
		   the next nav. Tool pickups count as loot too -- finding the
		   last EMF reader clears the room's highlight. */
		var lootSenseRooms = {};
		if (setup.HuntShop.hasUnlock(setup.HuntShop.ShopItem.LOOT_SENSE)) {
			var collected = Array.isArray(run.collectedLoot) ? run.collectedLoot : [];
			Object.keys(fp.loot || {}).forEach(function (kind) {
				if (collected.indexOf(kind) !== -1) return;
				var rid = fp.loot[kind];
				if (rid) lootSenseRooms[rid] = true;
			});
		}
		/* Reliable Recon: highlight the ghost's starting room until
		   it relocates for the first time. driftGhostRoom mutates
		   floorplan.spawnRoomId; once spawnRoomId no longer matches
		   originalSpawnRoomId, the recon highlight drops permanently. */
		var reconActive = setup.HuntShop.hasUnlock(setup.HuntShop.ShopItem.RELIABLE_RECON)
			&& fp.originalSpawnRoomId
			&& fp.spawnRoomId === fp.originalSpawnRoomId;
		var reconRoomId = reconActive ? fp.originalSpawnRoomId : null;
		var nodes = fp.rooms.map(function (r) {
			var p = positions[r.id] || { col: 0, row: 0 };
			var x = PAD + p.col * CELL_W;
			var y = PAD + p.row * CELL_H;
			var t = setup.Templates ? setup.Templates.byId(r.template) : null;
			var label = t ? t.label : r.template;
			var classes = ['hunt-minimap-room'];
			if (r.id === currentId)        classes.push('hunt-minimap-current');
			if (r.id === fp.bossRoomId)    classes.push('hunt-minimap-boss');
			if (lootSenseRooms[r.id])      classes.push('hunt-minimap-loot');
			if (r.id === reconRoomId)      classes.push('hunt-minimap-recon');
			return '<g class="' + classes.join(' ') + '" data-room="' + escapeXml(r.id) + '">' +
				'<rect x="' + x + '" y="' + y + '" width="' + ROOM_W +
				'" height="' + ROOM_H + '" rx="4" ry="4"/>' +
				'<text x="' + (x + ROOM_W / 2) + '" y="' + (y + ROOM_H / 2 + 4) +
				'" text-anchor="middle">' + escapeXml(label) + '</text>' +
				'</g>';
		});

		return '<svg class="hunt-minimap-svg" width="' + w + '" height="' + h +
			'" xmlns="http://www.w3.org/2000/svg">' +
			lines.join('') + nodes.join('') + '</svg>';
	}

	/* Humanise a loot kind ("cursedItem" -> "Cursed item"). Tool
	   loot kinds ('tool_emf', 'tool_uvl', ...) resolve to the
	   per-tool label in setup.searchToolDefs so the picked-up beat
	   reads as "EMF reader" rather than "Tool emf". */
	function humanizeLootKind(kind) {
		if (!kind) return '';
		var toolId = setup.FloorPlan.toolIdFromLootKind(kind);
		if (toolId) {
			var def = setup.searchToolDefs && setup.searchToolDefs[toolId];
			// def.label is markup like "Use EM@@color:yellow;F@@"; strip
			// the colour markers and the leading "Use " prefix so the
			// result is plain text.
			if (def && def.label) {
				return def.label
					.replace(/@@[^@]*@@/g, function (m) {
						return m.replace(/^@@[^;]*;|@@$/g, '');
					})
					.replace(/^Use\s+/, '');
			}
			return toolId.toUpperCase();
		}
		return kind
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, function (c) { return c.toUpperCase(); });
	}

	/* Humanise a furniture suffix ("wmachine" -> "Washing machine",
	   "sink1" -> "Sink"). Strips trailing digits, then maps known
	   abbreviations; falls back to title-case for unknown suffixes. */
	var FURNITURE_LABELS = {
		desk: 'Desk', table: 'Table', sink: 'Sink', wmachine: 'Washing machine',
		bathtub: 'Bathtub', bed: 'Bed', wardrobe: 'Wardrobe',
		coatrack: 'Coat rack', carpet: 'Carpet', sofa: 'Sofa', shelves: 'Shelves'
	};
	function humanizeFurniture(suffix) {
		if (!suffix) return '';
		var key = suffix.replace(/[0-9]+$/, '');
		return FURNITURE_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));
	}

	/* View-layer summary of the player's current room: name, the
	   furniture list (with any loot annotated), the loot kinds in
	   this room that aren't pinned to a specific piece of furniture,
	   and the adjacent-room nav links. HuntRun renders the furniture
	   strip and exit links from this record, so coverage here locks
	   in the structure. Returns null when no run is active. */
	function currentRoomData() {
		var run = active();
		if (!run || !run.floorplan) return null;
		var fp = run.floorplan;
		var roomId = run.currentRoomId || 'room_0';
		var room = fp.rooms.filter(function (r) { return r.id === roomId; })[0];
		if (!room) return null;
		var t = setup.Templates ? setup.Templates.byId(room.template) : null;
		var lootFurn = fp.lootFurniture || {};

		// Furniture entries with optional loot annotations. Collected
		// loot kinds are filtered out so a re-search of the same
		// slot reports nothing. lootKinds is the full uncollected
		// list (the floor-plan generator may stack multiple kinds on
		// the same slot when distinct slots run out); lootKind /
		// lootLabel keep the legacy single-value shape for callers
		// that only need a quick "is anything here".
		var furniture = (t && Array.isArray(t.furniture) ? t.furniture : []).map(function (f) {
			/* lootKindsAt already filters collected entries and applies
			   the per-kind availability gates (tarot/monkeyPaw/
			   clothesStolen), so the highlight matches what
			   FurnitureSearch will actually hand out. */
			var kinds = setup.HuntController.lootKindsAt(roomId, f);
			var first = kinds.length ? kinds[0] : null;
			return {
				suffix: f,
				label: humanizeFurniture(f),
				lootKind: first,
				lootLabel: first ? humanizeLootKind(first) : null,
				lootKinds: kinds
			};
		});

		// Loot assigned to this room but with no furniture pin
		// (templates without any furniture, e.g. roomA/B/C).
		var lootWithoutFurniture = [];
		Object.keys(fp.loot || {}).forEach(function (k) {
			if (fp.loot[k] === roomId && !lootFurn[k]) {
				lootWithoutFurniture.push({
					kind: k,
					label: humanizeLootKind(k)
				});
			}
		});

		// Adjacent-room nav links.
		var neighbors = setup.FloorPlan.neighborsOf(fp, roomId).map(function (id) {
			var nr = fp.rooms.filter(function (r) { return r.id === id; })[0];
			var nt = nr && setup.Templates ? setup.Templates.byId(nr.template) : null;
			return {
				id: id,
				template: nr ? nr.template : null,
				label: nt ? nt.label : (nr ? nr.template : id)
			};
		});

		return {
			id: roomId,
			template: room.template,
			label: t ? t.label : room.template,
			isSpawn: roomId === fp.spawnRoomId,
			isBoss: roomId === fp.bossRoomId,
			furniture: furniture,
			lootWithoutFurniture: lootWithoutFurniture,
			neighbors: neighbors
		};
	}

	/* Reset collapse state on hunt end so a fresh run always starts
	   expanded. Hooked here rather than from HuntController so the
	   module owns its own lifecycle. */
	setup.Hunt.on(setup.Hunt.Event.END, function () {
		minimapCollapsed = false;
	});

	return {
		minimapData: minimapData,
		minimapSvg: minimapSvg,
		isMinimapCollapsed: isMinimapCollapsed,
		toggleMinimapCollapsed: toggleMinimapCollapsed,
		humanizeLootKind: humanizeLootKind,
		humanizeFurniture: humanizeFurniture,
		currentRoomData: currentRoomData
	};
})();

/* Backwards-compat splice: existing call sites read these off
   setup.HuntController. */
setup.HuntController.minimapData            = setup.HuntMinimap.minimapData;
setup.HuntController.minimapSvg             = setup.HuntMinimap.minimapSvg;
setup.HuntController.isMinimapCollapsed     = setup.HuntMinimap.isMinimapCollapsed;
setup.HuntController.toggleMinimapCollapsed = setup.HuntMinimap.toggleMinimapCollapsed;
setup.HuntController.humanizeLootKind       = setup.HuntMinimap.humanizeLootKind;
setup.HuntController.currentRoomData        = setup.HuntMinimap.currentRoomData;
