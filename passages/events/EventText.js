/*
 * Per-tier prose for the haunting body-part events, keyed by
 * [bodyPart][corruptionTier].
 *
 * Tier keys come from setup.Events.corruptionTier(): 0, 1, 2, 3, 4,
 * 6, 8. Sparse maps (mouth, pussy, anal) rely on the
 * setup.Events.eventTextFor() resolver, which falls back to the
 * highest defined tier <= the requested tier.
 *
 * Strings are template literals for readability; newlines and the
 * indentation that follows them are stripped at lookup time so the
 * output matches the original `nobr` widget body. Use explicit <br>
 * tags for line breaks.
 */
setup.EventText = Object.freeze({
	brain: {
		0: `@@.mc-thoughts; You hear the ghost's whisper, its words creeping into your mind, but you easily shake it off.@@<br>
			@@.mc-speech; No, this isn't happening. I'm stronger than this.@@ -- @@.mc-thoughts; you say to yourself, confidently brushing off the images that vanish as quickly as they appear. You're fully in control.@@`,
		1: `@@.mc-thoughts; The ghost's whisper grows more persistent, and the images in your mind linger longer.@@
			@@.mc-speech; This has no power over me. I can ignore it.@@ -- @@.mc-thoughts;  -- you think, but it takes more effort now to push the thoughts away. They start to feel heavier, but you're still managing. Your hands begin to tremble faintly, though you try to suppress it.@@`,
		2: `@@.mc-thoughts; The images become sharper, and you feel tension building inside you.@@<br>
			@@.mc-speech; Why is this so hard to ignore?@@<br>
			@@.mc-thoughts; You notice your nipples hardening slightly, and your breathing deepens just a bit. A faint fluttering sensation stirs in your stomach@@<br>`,
		3: `@@.mc-thoughts; You can no longer fully ignore the images. They push deeper into your thoughts, making your body respond.@@<br>
			@@.mc-speech; Why am I starting to want this?@@<br>
			@@.mc-thoughts; Your chest is a little heavier and your hands reach for your boobs, squeezing them.@@`,
		4: `@@.mc-thoughts; You feel the struggle slipping away. Your thoughts are a mess, and your body is fully responding to the images@@<br>
			@@.mc-speech; I can't hide this anymore. It's... it's taking over.@@<br>
			@@.mc-thoughts; Your chest rises and falls with deep, heavy breaths. A tingling sensation builds in your core, and you feel wetness between your legs@@<br>`,
		6: `@@.mc-thoughts; You've stopped resisting the images entirely, your mind completely consumed by them@@<br>
			@@.mc-speech; I can't deny it anymore. I want to be there.@@ -- @@.mc-thoughts; you think, feeling your body burn with anticipation. You imagine yourself in the place of the girls in the images, and the desire becomes overwhelming.<br>
			@@.mc-thoughts; You put a finger in your mouth and start licking it, making sweet moans. @@<br>`,
		8: `@@.mc-thoughts; You've fully surrendered to the thoughts. You picture yourself in the place of those girls and crave for it to happen to you.@@<br>
			@@.mc-speech; I want this. Just let it happen already.@@ -- @@.mc-thoughts; you murmur, trembling as unbearable desire takes over your body.<br>
			You can't hold back anymore. Your hand slides down to your most intimate spot, fingers teasing yourself slowly. You slip them inside and begin to touch yourself, completely lost in the overwhelming sensations@@<br>`
	},
	tits: {
		0: `@@.mc-thoughts; A cold, almost spectral touch grazes your chest, as if someone unseen lightly brushed against your skin. A shiver runs through your body, but you quickly suppress the feeling, pulling yourself away.@@<br>
			@@.mc-speech; No. This has no power over me. I won't let this go any further.@@<br>`,
		1: `@@.mc-thoughts; The touch grows more insistent, the cold spreading across your skin, causing your nipples to stiffen. Your breathing quickens slightly, but you steady yourself, determined to resist.@@<br>
			@@.mc-speech; This isn't real. It's just a trick. I won't let it break me.@@<br>`,
		2: `@@.mc-thoughts; The touch feels warmer now, almost like someone is caressing your chest with tender but firm movements. Your heartbeat quickens, and a faint tingling sensation stirs in your lower abdomen. Despite your efforts, your body begins to react against your will.@@<br>
			@@.mc-speech; Why... Why is this so hard to ignore? This feels so wrong...@@<br>`,
		3: `@@.mc-thoughts; Warm, lifelike hands begin to softly squeeze your chest, drawing heavy breaths and barely stifled moans from your lips. Your nipples harden completely, and waves of heat ripple through your body.@@<br>
			@@.mc-speech; I need to fight this... but... why does it feel so good?!@@<br>`,
		4: `@@.mc-thoughts; The ghostly hands become bolder, massaging your chest as your own fingers unconsciously move up to touch yourself. Your breasts feel hot, and each caress sends a new wave of pleasure coursing through you.@@<br>
			@@.mc-speech; No... I can't fight this anymore... What's happening to me?@@<br>`,
		6: `@@.mc-thoughts; You completely surrender. The spectral hands tenderly squeeze and stroke your chest, sending waves of pleasure that leave you panting. You tilt your head back, letting faint moans escape your lips as your hands begin to trail down toward your stomach.@@<br>
			@@.mc-speech; I can't take it anymore... It's too... too good.@@<br>`,
		8: `@@.mc-thoughts; The hands firmly and insistently knead your chest, and you tremble with pleasure, giving yourself fully to the sensations. Your fingers trace along your skin, and you're consumed by overwhelming desire, wishing for this to never stop.@@<br>
			@@.mc-speech; Yes... This is what I want. Please, don't stop...@@<br>`
	},
	ass: {
		0: `@@.mc-thoughts; A sudden, cold touch brushes against your butt, like a ghostly hand daring to make contact. The chill sends a shiver up your spine, but you quickly straighten yourself, refusing to acknowledge it.@@<br>
			@@.mc-speech; No. This isn't happening. You have no control over me.@@<br>`,
		1: `@@.mc-thoughts; The touch lingers, more deliberate now, and you feel a faint squeeze on your behind. Your body tenses involuntarily, but you grit your teeth, determined not to let this affect you.@@<br>
			@@.mc-speech; I won't give in. It's just another trick.@@<br>`,
		2: `@@.mc-thoughts; The sensation turns warmer, the grip on your butt firmer. Heat creeps through your body despite your resistance, and you can't help but notice the tingling warmth spreading in your lower belly.@@<br>
			@@.mc-speech; No... I didn't allow you to do that!@@<br>`,
		3: `@@.mc-thoughts; The ghostly hand grows bolder, squeezing your ass with increasing confidence. A faint gasp escapes your lips as you feel your body responding, a pulsing warmth overtaking your resistance.@@<br>
			@@.mc-speech; You don't need to squeeze my butt so tightly...@@<br>`,
		4: `@@.mc-thoughts; You feel a playful slap on your ass, followed by a lingering caress. Your breath hitches, and without realizing it, your hips shift slightly, leaning into the touch.@@<br>
			@@.mc-speech; I can't stop it... It's too much... What's wrong with me?@@<br>`,
		6: `@@.mc-thoughts; The ghostly touch continues, alternating between firm squeezes and teasing slaps. You gasp aloud, your body trembling as waves of warmth roll through you. Your hands grip your thighs as if to steady yourself, but your body craves more.@@<br>
			@@.mc-speech; I can't resist anymore... I don't even want to...@@<br>`,
		8: `@@.mc-thoughts; The slaps grow more insistent, each one sending jolts of pleasure through your body. You arch your back instinctively, your body fully giving in to the sensations. Your fingers trail along your thighs, teasing yourself as you moan softly, lost in desire.@@<br>
			@@.mc-speech; Yes... I want this... Please, don't stop...@@<br>`
	},
	bottom: {
		0: `@@.mc-thoughts; It seems like it's still just a harmless game, his touches are gentle and almost unnoticeable. You manage to ignore them and keep yourself in control.@@<br>
			@@.mc-speech; This doesn't mean anything. I won't let myself give in.@@<br>`,
		1: `@@.mc-thoughts; His actions become a little more persistent, like he's testing how far he can go. You feel your body starting to weaken under his touch, but you can still resist.@@<br>
			@@.mc-speech; No, I have to stay strong... It's just an illusion.@@<br>`,
		2: `@@.mc-thoughts; Something changes, his touches begin to affect you. You notice your thoughts becoming confused and your heart racing, as if you're waiting for something.@@<br>
			@@.mc-speech; Hey! You can't do this to me...@@<br>`,
		3: `@@.mc-thoughts; He's getting bolder now, and you're struggling to hold back. Your body reacts to his actions, and unwanted thoughts start to creep in.@@<br>
			@@.mc-speech; I didn't let you do this...@@<br>`,
		4: `@@.mc-thoughts; It seems like the game is over, and now he's getting even bolder. You feel control slipping away as desire starts to take over your thoughts.@@<br>
			@@.mc-speech; Oh~ I... I can't stop this...@@<br>`,
		6: `@@.mc-thoughts; His actions are becoming more daring, and you can't resist anymore. Your body completely gives in, and there's no room for resistance in your mind.@@<br>
			@@.mc-speech; I don't want to fight it anymore... Let it continue...@@<br>`,
		8: `@@.mc-thoughts; He's completely in control now, and all you want is more. It's like everything happening right now is exactly what you desire, and you can't resist anymore.@@<br>
			@@.mc-speech; Yes... This is what I want... Don't stop...@@<br>`
	},
	mouth: {
		0: `@@.mc-thoughts; The ghost appears in front of you and presses down on your shoulders, forcing you to fall to your knees in front of him. You try to scream, but his hot big cock crashes into your mouth and starts raping your throat. You are afraid to resist, because you don't know what he is capable of.@@<br>
			@@.mc-speech; ~Gurlp~Gulp~No, I will not submit to you ~Agh~@@<br>`,
		4: `@@.mc-thoughts; The ghost pushes you and you fall. You already know what will happen next. Without any resistance from you, his big cock easily penetrates your wet mouth.@@<br>
			@@.mc-speech; Ah! I must not give in so easily@@<br>`,
		6: `@@.mc-thoughts; Something pushed you. You try to get up, but the ghost stops you and shoves his cock down your throat.@@<br>
			@@.mc-speech;  AH~ why so rough! You can be gentler with me...@@<br>`,
		8: `@@.mc-thoughts; The ghost appears in front of you and pushes. You look up and see his cock in front of your face. There's only one thought in your head: where will he fuck you this time.<br>
			He brings it to your face and you take it in your mouth yourself, capturing it with your lips so it doesn't escape.@@<br>
			@@.mc-speech; Yeaaa~~ fuck my face, I deserve it~@@<br>`
	},
	pussy: {
		0: `@@.mc-thoughts; The ghost appears in front of you, and this time it seems he is very aroused. Taking advantage of your distraction, he shoves his already erect cock into your pussy.@@<br>
			@@.mc-speech; Oh, no, get away from me, you piece of shit!@@<br>`,
		4: `@@.mc-thoughts; The ghost appears in front of you, and this time it seems he is very aroused. Taking advantage of your distraction, he shoves his already erect cock into your pussy.@@<br>
			@@.mc-speech; Oh~ you bastard, you shouldn't do that to women@@`,
		6: `@@.mc-thoughts; The ghost appears in front of you, and it seems like he's really turned on this time. You notice him, but you react fast enough and he starts fucking you in your wet pussy.@@<br>
			@@.mc-speech;  Oh fuck, you caught me~ ah~ it feels so good@@`,
		8: `@@.mc-thoughts; The ghost appears in front of you, and it seems like he's really turned on this time. You notice him, but you react fast enough and he starts fucking you in your wet pussy.@@<br>
			@@.mc-speech; AHH~ Yeah, fuck me, I'm your slut~ be rough with me@@<br>`
	},
	anal: {
		0: `@@.mc-thoughts; The ghost appears in front of you, and this time it seems he is very aroused. He grabs you and shoves his dick right up your ass.@@<br>
			@@.mc-speech; Ah~ why would anyone want to stick their dick up there?!@@<br>`,
		4: `@@.mc-thoughts; The ghost appears in front of you, and this time it seems he is very aroused. He grabs you and shoves his dick right up your ass.@@<br>
			@@.mc-speech; Ah~ why would anyone want to stick their dick up there?!@@`,
		6: `@@.mc-thoughts; The ghost appears in front of you, and it seems like he's really turned on this time. He grabs you and shoves his dick right up your ass.@@<br>
			@@.mc-speech;  Ah~ that's my ass, be gentle with it...@@<br>`,
		8: `@@.mc-thoughts; The ghost appears in front of you, and it seems like he's really turned on this time. He grabs you and shoves his dick right up your ass.@@<br>
			@@.mc-speech; AH~ You're inside my ass, it feels so good~@@<br>`
	}
});
