/*
 * Achievement toast: Xbox-360-style slab that slides in from the
 * bottom-left, plays the unlock sting, and slides out. Subscribes to
 * the Achievements bus so anything that calls setup.Achievements.unlock
 * gets a toast for free.
 *
 * Queueing: unlocks fired in the same tick (multi-unlock at hunt end)
 * are shown one at a time, each holding for HOLD_MS, so they don't
 * stack on top of each other.
 */
(function () {
	var HOLD_MS = 4200;
	var SLIDE_MS = 420;
	/* Cadence for cycling between the default green orb and the
	   per-achievement icon. The orb starts green, flips to the icon
	   after ICON_SWAP_DELAY_MS, then keeps alternating every
	   ICON_SWAP_DELAY_MS for as long as the toast is up. Only applies
	   when the catalogue entry has an icon; iconless toasts stay green
	   for the full hold. */
	var ICON_SWAP_DELAY_MS = 700;
	var AUDIO_SRC = 'audio/achievement-unlocked.mp3';

	var queue = [];
	var showingId = null;   // id currently on screen, or null when idle
	var $container = null;
	var audio = null;

	function ensureContainer() {
		if ($container) return $container;
		$container = $('<div class="achievement-toast-stack" aria-live="polite"></div>')
			.appendTo(document.body);
		return $container;
	}

	function audioSrc() {
		var base = (setup && setup.ImagePath) ? setup.ImagePath : 'assets';
		return base.replace(/\/+$/, '') + '/' + AUDIO_SRC;
	}

	function playSting() {
		try {
			if (settings && settings.muteAllVideos) return;
		} catch (e) { /* settings not ready */ }
		try {
			if (!audio) {
				audio = new Audio(audioSrc());
				audio.preload = 'auto';
			}
			audio.currentTime = 0;
			var p = audio.play();
			if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay blocked */ });
		} catch (e) { /* ignore */ }
	}

	function iconUrl(relPath) {
		var base = (setup && setup.ImagePath) ? setup.ImagePath : 'assets';
		return base.replace(/\/+$/, '') + '/' + String(relPath).replace(/^\/+/, '');
	}

	function show(entry) {
		var $stack = ensureContainer();
		var name = (entry && entry.name) || 'Achievement Unlocked';
		/* Orb DOM is three stacked layers so the green->icon swap can
		   cross-fade independently of the toast slide animation:
		     .orb-bg     the green glass gradient
		     .orb-img    the per-achievement icon (only when entry.icon)
		     .orb-inner  the white specular highlight
		   show-icon adds the class that drives the cross-fade. */
		var $toast = $(
			'<div class="achievement-toast" role="status">' +
				'<div class="achievement-toast-orb" aria-hidden="true">' +
					'<div class="achievement-toast-orb-bg"></div>' +
					'<div class="achievement-toast-orb-inner"></div>' +
				'</div>' +
				'<div class="achievement-toast-text">' +
					'<div class="achievement-toast-label">Achievement Unlocked</div>' +
					'<div class="achievement-toast-name"></div>' +
				'</div>' +
			'</div>'
		);
		$toast.find('.achievement-toast-name').text(name);
		var $orb = $toast.find('.achievement-toast-orb');
		if (entry && entry.icon) {
			var $img = $('<img class="achievement-toast-orb-img" alt="" />').attr('src', iconUrl(entry.icon));
			$orb.addClass('has-icon').prepend($img);
		}
		$stack.append($toast);

		// Force a layout flush so the .show class transitions instead of
		// applying instantly.
		// eslint-disable-next-line no-unused-expressions
		$toast[0].offsetHeight;
		$toast.addClass('show');
		playSting();

		/* Toast holds for HOLD_MS, then slides out. If the entry has an
		   icon, cycle the orb between green and icon every
		   ICON_SWAP_DELAY_MS so both states stay visible for the whole
		   hold rather than swapping once and freezing on the icon. */
		var swapInterval = null;
		if (entry && entry.icon) {
			swapInterval = setInterval(function () {
				$orb.toggleClass('show-icon');
			}, ICON_SWAP_DELAY_MS);
		}

		setTimeout(function () {
			if (swapInterval) clearInterval(swapInterval);
			$toast.removeClass('show').addClass('hide');
			setTimeout(function () {
				$toast.remove();
				showingId = null;
				drain();
			}, SLIDE_MS);
		}, HOLD_MS);
	}

	function drain() {
		if (showingId !== null) return;
		if (!queue.length) return;
		var entry = queue.shift();
		showingId = entry.id;
		show(entry);
	}

	/* Coalesce: if the same id is already on screen or already waiting
	   in the queue, drop the new press. Without this, mashing a
	   repeatable trigger (e.g. the bedroom sploosh button) piles up a
	   backlog of identical toasts that play out for HOLD_MS each. The
	   visible toast keeps running; the next legitimate re-press will
	   fire again once it has cleared. */
	function enqueue(ctx) {
		if (!ctx || !ctx.entry) return;
		var id = ctx.entry.id;
		if (showingId === id) return;
		for (var i = 0; i < queue.length; i++) {
			if (queue[i].id === id) return;
		}
		queue.push(ctx.entry);
		drain();
	}

	$(document).one(':storyready', function () {
		setup.Achievements.on(setup.Achievements.Event.UNLOCKED, enqueue);
	});
})();
