/*
 * HuntNavFit: sizes .hunt-run-nav (the room-exit links on the lower
 * right of the hunt screen) into a bounded box that runs from just
 * below .hunt-run-hud -- the "lower bar" beneath the light icons --
 * down to the bottom of the viewport, then shrinks the link
 * font-size until the natural content height fits inside that box.
 *
 * CSS owns the right/bottom anchor and the flex layout shape; this
 * file owns the vertical bounds (so they track the live HUD position)
 * and the font-size scaling (so an arbitrary number of exits never
 * overruns the box). Replaces the old .hunt-run-nav-compact hand-
 * tuned shrink for >3 exits with an automatic fit that works for any
 * exit count.
 */
setup.HuntNavFit = (function () {
	function fit() {
		var nav = document.querySelector('.hunt-run-nav');
		var hud = document.querySelector('.hunt-run-hud');
		if (!nav || !hud) return;

		var hudRect = hud.getBoundingClientRect();
		var viewportH = window.innerHeight;
		var topPx = Math.round(hudRect.bottom + 4);
		var bottomMargin = 8;
		var availableH = viewportH - topPx - bottomMargin;
		if (availableH <= 0) return;

		/* Reset to natural size before measuring so each fit pass
		   starts from the same baseline -- otherwise repeated fits
		   (resize, passage re-render) compound the shrink. */
		nav.style.top = topPx + 'px';
		nav.style.height = availableH + 'px';
		nav.style.fontSize = '';

		/* Iterative shrink: a single ratio pass under-shrinks because
		   line-height minimums and text-wrap rounding don't scale
		   linearly with font-size. Loop until the natural content
		   fits or we hit the readability floor. */
		var minSize = 8;
		var maxIter = 8;
		while (nav.scrollHeight > availableH + 2 && maxIter-- > 0) {
			var current = parseFloat(window.getComputedStyle(nav).fontSize);
			var ratio = availableH / nav.scrollHeight;
			var next = Math.max(minSize, current * ratio * 0.92);
			if (next >= current) break;
			nav.style.fontSize = next + 'px';
			if (next === minSize) break;
		}
	}

	function fitDeferred() {
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(fit);
		} else {
			setTimeout(fit, 0);
		}
	}

	$(document).on(':passagedisplay.huntNavFit', fitDeferred);
	$(window).on('resize.huntNavFit', fitDeferred);

	return { fit: fit };
})();
