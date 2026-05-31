/*
 * Company-rescue redirect: the ambulance branch off an assaulted hunt end.
 *
 * Rather than branch inside HuntOverProwl / HuntOverSanity, this listens
 * on the hunt bus. When a hunt ends in assault there's a 30% chance the
 * MC is intercepted by the Norville & Co. crew (CompanyRescue) instead of
 * playing out the ghost scene. The HUNT_END_ASSAULTED notification fires
 * from inside the assault passage's own render, so we can't navigate then
 * -- instead we *arm* a one-shot redirect that fires on the player's next
 * in-story link click. The player sees the assault passage open, clicks to
 * advance, and lands in the van.
 *
 * Double-emit guard: an assaulted hunt emits HUNT_END_ASSAULTED twice --
 * once as the scene trigger from the HuntOver passage (run still live) and
 * once from endHunt() as the lifecycle settle (end() has already cleared
 * $run by then). We only arm on the first by gating on a live run, so the
 * post-settle emit -- including the one CompanyRescue itself fires when it
 * calls endHunt() -- never re-arms.
 *
 * The armed flag is module-local, not $State: it's transient behavior,
 * decided and consumed within a couple of clicks, and re-registered on
 * load like every other bus subscriber.
 *
 * Loads before Hunt.js (C < H in the Tweego concat order), so the bus
 * subscription is deferred to :storyready -- same rationale as the ghost
 * catalogue registrar.
 */
setup.CompanyRescue = (function () {
	var REDIRECT_PASSAGE = 'CompanyRescue';
	var REDIRECT_PERCENT = 30;

	// One-shot "send the next in-story click to the ambulance" latch.
	var pending = false;

	/* Roll the redirect when a hunt ends in assault. Only the
	   scene-trigger emit (run still active) is eligible; the lifecycle
	   settle emit arrives after end() has cleared $run and is ignored. */
	function onAssaulted() {
		if (!setup.HuntController.isActive()) return;
		pending = (Math.floor(Math.random() * 100) + 1) <= REDIRECT_PERCENT;
	}

	/* Capture-phase click handler: when armed, swallow the player's next
	   click on a passage link and route it to CompanyRescue. Capture +
	   stopImmediatePropagation means the link's own SugarCube handler
	   (linkreplace expand / passage nav) never runs, so there's no flash
	   of the assault scene advancing before the redirect. */
	function onPassageClick(ev) {
		if (!pending) return;
		var el = ev.target;
		var link = (el && el.closest) ? el.closest('#passages a') : null;
		if (!link) return;
		pending = false;
		ev.preventDefault();
		ev.stopImmediatePropagation();
		setTimeout(function () { Engine.play(REDIRECT_PASSAGE); }, 0);
	}

	$(document).one(':storyready', function () {
		setup.Hunt.on(setup.Hunt.Event.HUNT_END_ASSAULTED, onAssaulted);
		document.addEventListener('click', onPassageClick, true);
	});

	return {
		/* True while a redirect is armed and waiting on the next click.
		   Exposed for tests. */
		isArmed: function () { return pending === true; },
		/* Clear the latch. Production rarely needs this (a click consumes
		   it); tests call it to scrub the module-local flag between runs
		   since Engine.restart() doesn't re-evaluate controllers. */
		resetRedirect: function () { pending = false; }
	};
})();
