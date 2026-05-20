/*
 * Hunt address vocabulary.
 *
 * Pure data + hash helpers split out of HuntController so the
 * 100-line street name / suffix tables can be extended without
 * scrolling past the hunt lifecycle. addressFromSeed deterministically
 * maps a 32-bit seed to a {number, road, suffix, formatted} record;
 * the same seed always produces the same address, so saves and lobby
 * previews stay stable across reloads.
 *
 * Loads alphabetically before HuntController.js so HuntController can
 * reference setup.HuntAddresses.addressFromSeed at module-load time.
 * Tests and HuntController re-export ROAD_NAMES / ROAD_SUFFIXES /
 * addressFromSeed onto setup.HuntController for backwards compat.
 */
setup.HuntAddresses = (function () {
	var ROAD_NAMES = Object.freeze([
		'Hollow', 'Marrow', 'Wraith', 'Cinder', 'Blackthorn',
		'Moan Manor', 'Penetration Point', 'Ectoplasm',
		'Haunted Hole-in-One', 'Thrust & Spirit', 'Apparition Ass',
		'Creaky Bedpost', 'Bump-in-the-Night', 'Wailing Wall',
		'Poltergeist Pound Town', 'Spectre Spread Eagle',
		'Banshee Backdoor', 'Scream-and-Cream', 'Phantom Phallus',
		'Ghoul G-Spot', 'Uninvited Thrust', 'Missionary Position',
		'Ethereal Entry Point', 'She-Came', 'Shrieking Sheets',
		'Possession Point', 'Haunted Hump', 'Ectoplasmic Release',
		'Exorcism Exit', 'Seance and Sensuality', 'Wailing Banshee',
		'Poltergeist', 'Screaming', 'Possession', 'Shrieking Spectre',
		'Haunting', 'Apparition', 'Phantom Flesh', 'Corpse Bride',
		'Exorcism', "Demon's Doorstep", 'Hellmouth', 'Seance',
		'Witching Hour', "Grave Robber's", 'Coven', 'Cursed',
		'Blood Moon', 'Damned', 'Climax Crypt', 'Wail and Wail Again',
		'Throbbing', 'Uninvited Entry', 'Creak and Peak',
		'Restless and Relentless', 'Paranormal Pound Town',
		'Poltergeist Pleasure', 'Spirit Thrust',
		'Exorcised and Satisfied', 'Demon Seed', 'Hellfire and Hips',
		"Crypt Keeper's Climax", 'Succubus', 'Incubus',
		'Horny Haunting', 'Lust and Lament', 'Eternal Thrust',
		'Screaming Flesh', 'Damnation', 'Hellfire',
		'Writhing Wraith', 'Tormented', 'Bleeding Veil',
		'Cursed Cavity', 'Howling Pit', 'Mortuary Moan',
		'Coffin Creak', 'Rotting Rose', 'Shadowflesh',
		'Wretched Wail', 'Corpse Light', 'Smothering Dark',
		'Shroud and Shudder', 'Gaping Grave', 'Blackblood',
		'Throbbing Phantom', 'Dripping Ectoplasm', 'Spectral Thrust',
		'Pulsing Portal', 'Grinding Ghoul', 'Slick Specter',
		'Wet Wraith', 'Moaning Mortuary', 'Thrusting',
		'Paranormal Pleasure', 'Pounding Poltergeist',
		'Lust of the Damned', 'Heaving Haunted',
		'Seance and Submission', 'Restless Flesh', 'Demonic Desire',
		'Hungry Haunting', 'Flesh and Phantom', 'Grinding Grave',
		'Wail of the Willing', 'Shuddering Specter',
		'Damned and Dripping', 'Howling Hips', 'Possession and Pleasure',
		'Lament and Lust', 'Exorcised Ecstasy', 'Sinful Specter',
		'Hellbound Hips', 'Wailing and Wanting', 'Cursed Climax',
		'Dripping Dark', 'Forbidden Flesh', 'Moaning Mist',
		'Phantom and Fornication', 'Grinding Grimoire', 'Bloody Bliss',
		'Howling Hunger', 'Damned Desire', 'Oozing Oracle',
		"Witch's Wet", 'Possessed and Pleasured', 'Coven Climax',
		'Screeching Satisfaction', 'Hellcat Hips', 'Rotting Rapture',
		'Banshee and Breathless', 'Throbbing Tomb', 'Sinister Slick',
		'Wretched and Wanting', 'Grave Grinding'
	]);
	var ROAD_SUFFIXES = Object.freeze([
		'Lane', 'Court', 'Drive', 'Row', 'Way',
		'Boulevard', 'Avenue', 'Circle', 'Street', 'Road', 'Crossing',
		'Freeway', 'Grove', 'Terrace', 'Highway', 'Place', 'Pass',
		'Hollow', 'Expressway', 'Square', 'Passage', 'Alley', 'Ground',
		'District', 'Threshold', 'Mile', 'Strip', 'Intersection',
		'Sprawl', 'Inlet', 'Drag', 'Overpass',
		'Trail', 'Path', 'Bypass', 'Parkway', 'Turnpike', 'Causeway',
		'Mews', 'Close', 'Walk', 'Promenade', 'Plaza', 'Junction',
		'Loop', 'Ridge', 'Heights', 'Gardens', 'Glen', 'Vale',
		'Crescent', 'Gate', 'Yard', 'End', 'Wynd', 'Mire', 'Bog',
		'Cul-de-sac', 'Bend', 'Reach', 'Spur', 'Slope',
		'Boo-ties', 'Scroo-levard', 'Moan-or', 'Thrust-errace',
		'Lay-ne', 'Stroke-street', 'Cliti-court', 'Shaft-way',
		'Gush-grove', 'Climax-crossing', 'Ride-way', 'Groan-grove',
		'Cum-court', 'Stroke-square', 'Suck-cessway', 'Drip-drive',
		'Wet-walk', 'Squirt-street', 'Pulseway', 'Lick-lane',
		'Thrust-through', 'Plunge-place', 'Grind-gate', 'Swell-square',
		'Gape-grove', 'Pound-pass'
	]);

	/* xorshift-style 32-bit mix, salted so the three address fields
	   pull from independent bit streams of the same seed. */
	function mix32(seed, salt) {
		var x = ((seed >>> 0) ^ (salt >>> 0)) >>> 0;
		x = Math.imul(x, 0x85ebca6b) >>> 0;
		x = (x ^ (x >>> 13)) >>> 0;
		x = Math.imul(x, 0xc2b2ae35) >>> 0;
		x = (x ^ (x >>> 16)) >>> 0;
		return x >>> 0;
	}

	function addressFromSeed(seed) {
		var s = (seed >>> 0);
		var num = (mix32(s, 0xa3c59ac3) % 999) + 1;
		var road = ROAD_NAMES[mix32(s, 0x6b79f5d1) % ROAD_NAMES.length];
		var suffix = ROAD_SUFFIXES[mix32(s, 0x1f83d9ab) % ROAD_SUFFIXES.length];
		return {
			number: num,
			road: road,
			suffix: suffix,
			formatted: num + ' ' + road + ' ' + suffix
		};
	}

	return {
		ROAD_NAMES: ROAD_NAMES,
		ROAD_SUFFIXES: ROAD_SUFFIXES,
		addressFromSeed: addressFromSeed
	};
})();
