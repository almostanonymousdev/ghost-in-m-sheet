// Centralized RNG helpers. Thin wrappers over Math.random so the
// test fixture's installSeededRng(page, seed) still drives every
// roll (it monkey-patches Math.random itself), while controllers
// get a vocabulary that's harder to misuse than the bare
// `list[Math.floor(Math.random() * list.length)]` idiom.
setup.Rng = (function () {
	// Random element of `list`, or null if the list is empty/missing.
	// Most callers want this rather than a separate length check + index.
	function pickFrom(list) {
		if (!list || !list.length) return null;
		return list[Math.floor(Math.random() * list.length)];
	}

	// Uniform integer in [min, max] -- both ends inclusive.
	function intInclusive(min, max) {
		return min + Math.floor(Math.random() * (max - min + 1));
	}

	return { pickFrom: pickFrom, intInclusive: intInclusive };
})();
