# Visual Storyboard — Milo and the Little Garden Rescue

For use by whoever produces the actual art/animation/video assets (illustrator, animator, or an AI art/video tool). Pairs with `story_milo_garden_rescue_v1.json` — segment IDs, interaction IDs, and VR hotspot IDs below match that file exactly.

---

## Overall Art Direction

- **Style:** soft, storybook-illustration style — rounded shapes, warm outlines, gentle textures (think watercolor-meets-flat-vector, not photorealistic). Should read as gentle and safe for a young audience.
- **Palette:** warm garden tones — moss green, sunlight yellow, soft terracotta (red gate, red bucket), sky blue (Pip, backpack), with golden-hour amber lighting in later segments as the sun sets
- **Characters:**
  - *Milo* — a light grey/cream rabbit, blue backpack, carries a yellow watering can. Expressive, rounded features, big eyes for readability at a distance (important for VR/360 framing)
  - *Pip* — a small blue bird, quick fluttery movement, perches on Milo's shoulder
  - *Grandma Turtle* — mossy-green shell with a warm pattern, slow deliberate movement, calm presence, associated with the red gate and the clearing
- **Recurring visual motifs:** the yellow watering can (tracks its condition — leaking → taped → working), footprints (bird/rabbit/turtle, sized differently), the red gate as a location marker, three flowers (yellow/pink/orange) as a repeated "spot the difference" visual

---

## Segment 1 — "The Drooping Flower" (00:00–02:30)

**Scene:** Morning light, Milo hops along a garden path, greets Pip in a tree, they walk together and discover a single drooping flower next to a red bucket, blue toy shovel, and the yellow watering can.

| Modality | Treatment |
|---|---|
| **C1 Simple Video** | Wide establishing shot of the garden path at sunrise, camera follows Milo at a friendly mid-shot height (rabbit's-eye-adjacent, not overhead). Cut to close-up on the drooping flower when Milo notices it — petals visibly wilted, leaves hanging. |
| **C2 Spatial Audio** | Birdsong (Pip) should pan from off-screen right into center as he lands on Milo's shoulder. Wind/leaf rustle establishes ambient space. Milo's dialogue centered; Pip's "Tweet!" panned to match his on-screen position. |
| **C3 Interactive** | At `int_01` (00:35): the drooping flower and 2-3 healthy flowers nearby are all lightly outlined/glowing as tappable — user taps the correct one. At `int_02` (01:20): watering can is highlighted with a "hold" affordance (subtle pulsing glow); holding triggers a leak animation (drip particles) revealing the hole. |
| **C4 VR** | User stands on the garden path, flower bed slightly ahead and to the left (`h1` position). Watering can sits at their feet/nearby (`h2`). Gaze-dwell on the flower triggers a soft highlight + Milo's voiceover reacting ("Oh dear..."). Full 360 garden should include background flora even outside the direct sightline for immersion. |

---

## Segment 2 — "Fixing the Watering Can" (02:30–05:00)

**Scene:** Wind gust scatters leaves and knocks Milo's backpack down; Milo and Pip cross a wooden bridge over a stream to find Grandma Turtle's toolbox under a tree; Milo picks tape over ribbon/cloth and fixes the can.

| Modality | Treatment |
|---|---|
| **C1 Simple Video** | Dynamic wind moment — leaves visibly blow across frame, backpack falls (small physical-comedy beat). Then a calmer tracking shot alongside Milo crossing the bridge, water sound below. Close-up insert on the toolbox opening (three items laid out clearly). |
| **C2 Spatial Audio** | Wind should sweep audibly left-to-right (or match on-screen leaf direction) — this is a strong spatial-audio moment, use it deliberately. Stream/water sound should feel like it's coming from below/beside the bridge, growing louder as Milo crosses. Toolbox "Click!" sound centered and crisp. |
| **C3 Interactive** | At `int_03` (03:00): bridge planks are the trace target — user traces a path across 4-5 stepping points in sequence, small "step" sound/visual feedback per point. At `int_04` (03:50): three toolbox items (tape, ribbon, cloth) are draggable; user drags one onto the watering can icon — wrong item bounces back gently (no harsh fail state), tape sticks with a satisfying snap + patch visual appears on the can. |
| **C4 VR** | Bridge should be walkable/gaze-navigable if locomotion is supported; if gaze-only for Stage 1, use a comfortable fixed viewpoint at the bridge's midpoint with the stream visible below. Toolbox hotspot (`h3`) sits under the tree, slightly requiring the user to look down/around — good use of VR's spatial advantage over flat interaction. |

---

## Segment 3 — "The Mystery Sound & Grandma's Lesson" (05:00–07:30)

**Scene:** A "Ting!" sound leads Milo and Pip to a flower bed with three flowers (yellow drooping, pink and orange healthy), then through a red gate, following footprints to Grandma Turtle, who teaches the sunlight/water/care lesson.

| Modality | Treatment |
|---|---|
| **C1 Simple Video** | Comparison shot: all three flowers in one frame so the drooping one is visually obvious even without interaction. Red gate as a clear transition marker (push/swing open). Grandma Turtle scene: calm, static-ish framing, warm light, Grandma centered, Milo and Pip smaller in frame (visual hierarchy = listening moment). |
| **C2 Spatial Audio** | The mystery "Ting!" sound should be spatially ambiguous at first (soft, unclear direction) then clarify as Milo gets closer — a nice spatial-audio "puzzle" beat matching the story's own mystery. Grandma's voice should feel grounded/centered, slightly lower register for a calm authoritative tone. |
| **C3 Interactive** | At `int_05` (05:40): three flowers are each tappable, only the yellow one is correct — subtle "not quite" bounce feedback on wrong picks rather than a red X (keep it gentle/encouraging, this is for a young audience). At `int_06` (06:30): footprint trail is a trace-path task, three footprint sizes visible (bird/rabbit/turtle) — user traces the big (turtle) prints specifically. |
| **C4 VR** | Flower bed hotspot (`h5`) requires the user to visually compare three flowers side-by-side — good VR use of peripheral comparison. Footprint trail (`h4`) laid along the ground plane, encouraging the user to look down, a natural VR gaze behavior. Grandma's clearing should feel like a small, cozy "destination" space — enclosed by trees/bushes to signal arrival. |

---

## Segment 4 — "Look, Think, Help" (07:30–10:00)

**Scene:** Milo returns to the yellow flower, applies Grandma's lesson (look, think, help), waters it, watches it recover; the three friends sit together as the sun sets.

| Modality | Treatment |
|---|---|
| **C1 Simple Video** | Slow, deliberate pacing to match "look... think... help" — three distinct beats, maybe a brief pause/held frame on Milo's thoughtful expression before he acts. The flower recovery (drooping → standing tall, petals opening with a "Pop!") is the emotional payoff — give it a clean, satisfying animation beat, not rushed. Final wide shot: golden-hour, all three characters together, flower standing tall in frame. |
| **C2 Spatial Audio** | Quieter, sparser soundscape here — let the "Shhhhhhh" of water soaking in and the "Pop!" of the flower opening really land without competing ambient noise. Evening ambience (crickets/soft wind) fades in gently as the scene settles, spatially "wrapping around" the listener for the closing moment. |
| **C3 Interactive** | At `int_07` (08:15): three lesson-step cards ("Look", "Think", "Help") are draggable into three ordered slots — this is the `assemble` verb, give clear slot outlines and a satisfying lock-in animation per correct placement. At `int_08` (09:10): hold-to-pour interaction on the watering can over the flower — a filling meter/progress ring is a good visual for the "hold" affordance, triggering the recovery animation on completion. |
| **C4 VR** | This is the emotional closing beat — consider a slightly wider FOV or a gentle camera-height rise as the flower recovers, giving a sense of the whole garden "breathing" again. No new hotspots needed here beyond reusing `h1` (the flower) — let this segment be more about ambient immersion (lighting change to golden hour, sound) than new interaction density, since it's the resolution, not a new puzzle. |

---

## Asset checklist for production

- Milo (rabbit) — idle, walk/hop, react (surprised/happy/thoughtful), holding watering can
- Pip (bird) — perch, flutter/fly, tweet reaction
- Grandma Turtle — idle, walk (slow), talking/gesture
- Watering can — normal, leaking (drip particles), taped/patched, pouring
- 3-flower bed (yellow/pink/orange) — drooping state + healthy/recovered state for yellow
- Wooden bridge + stream (with water animation/sound loop)
- Toolbox + 3 items (tape, ribbon, cloth)
- Footprint sets (bird, rabbit, turtle — 3 distinct sizes/shapes)
- Red gate (open/closed states)
- Garden environment — day lighting variant (segments 1-3) and golden-hour variant (segment 4), both as flat backgrounds (C1-C3) and full 360 environments (C4)
