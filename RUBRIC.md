# Audio Alchemy — Listening Rubric

Internal quality rubric for Fast (Turbo) vs Quality (SFT) bake-offs. Not marketing copy. Not legal advice.

## Scores (1-5)

| Dimension | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Realism | Obviously synthetic / broken | Usable draft | Believable as a demo take |
| Drum authenticity | Machine-gun / lifeless kit | Mixed | Live-sounding kit, human dynamics |
| Guitar tone | Thin, fizzy, or wrong for prompt | Acceptable | Down-tuned / genre-appropriate tone |
| Arrangement | Random cuts / no form | Some sections | Clear sections matching prompt |
| Prompt adherence | Wrong genre/mood | Partial match | Clear match to prompt + tags |
| Artifacts | Constant glitches | Occasional | Clean enough as a draft |

Legacy columns (adherence / coherence / mastering) map roughly to prompt adherence / arrangement / realism.

## Blind A/B protocol

1. Same prompt for Fast (Turbo) and Quality (SFT).
2. Randomize left/right labels; hide checkpoint and preset names (blind_listening.csv + sealed blind_key.json).
3. Prefer >=20 listens for default changes; minimum 10 for local-only tweaks.
4. Preference: fast / quality / tie (or A/B/tie on the blind sheet).
5. Ship threshold: win rate >= 55% excluding ties to change a default.
6. Do not publish platform-comparison claims.

## Sheet

Use scripts/eval/blind_ab_template.csv, or compare.csv / blind_listening.csv from the compare script.

## Ownership note

Eval guides product defaults only. Ownership policy remains: you own your generations (product policy), not a legal guarantee.
