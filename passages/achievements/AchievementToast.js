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
	var AUDIO_SRC = 'audio/achievement-unlocked.mp3';

	var queue = [];
	var showing = false;
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

	function show(entry) {
		var $stack = ensureContainer();
		var name = (entry && entry.name) || 'Achievement Unlocked';
		var $toast = $(
			'<div class="achievement-toast" role="status">' +
				'<div class="achievement-toast-orb" aria-hidden="true">' +
					'<div class="achievement-toast-orb-inner"></div>' +
				'</div>' +
				'<div class="achievement-toast-text">' +
					'<div class="achievement-toast-label">Achievement Unlocked</div>' +
					'<div class="achievement-toast-name"></div>' +
				'</div>' +
			'</div>'
		);
		$toast.find('.achievement-toast-name').text(name);
		$stack.append($toast);

		// Force a layout flush so the .show class transitions instead of
		// applying instantly.
		// eslint-disable-next-line no-unused-expressions
		$toast[0].offsetHeight;
		$toast.addClass('show');
		playSting();

		setTimeout(function () {
			$toast.removeClass('show').addClass('hide');
			setTimeout(function () {
				$toast.remove();
				showing = false;
				drain();
			}, SLIDE_MS);
		}, HOLD_MS);
	}

	function drain() {
		if (showing) return;
		if (!queue.length) return;
		showing = true;
		var entry = queue.shift();
		show(entry);
	}

	function enqueue(ctx) {
		if (!ctx || !ctx.entry) return;
		queue.push(ctx.entry);
		drain();
	}

	$(document).one(':storyready', function () {
		setup.Achievements.on(setup.Achievements.Event.UNLOCKED, enqueue);
	});
})();
