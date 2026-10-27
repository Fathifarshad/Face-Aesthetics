# Brand and design system

## 1. Product brand
- Working name: `[APP_NAME]` (placeholder). Name ideas to check for trademark/domain availability before use:
  "Chehreh Pro" (چهره‌پرو), "Tanasob" (تناسب), "Proporta"
- Positioning (fa): «دستیار آنالیز و برنامه‌ریزی درمان زیبایی، ویژهٔ پزشک»
- Positioning (en): "Measured aesthetic analysis and treatment planning for physicians"
- Personality: clinical, calm, precise, respectful. Not glamorous, not "beauty filter"
- Logo: wordmark in Vazirmatn 700 + a simple mark (face outline with a vertical midline and three horizontal thirds lines). Placeholder until designed

## 2. Clinic / doctor branding (white-label, in Settings)
Shown on the patient report and the app header:
- Clinic logo (PNG/SVG, max 512 px), clinic name, address, phone
- Doctor name, title, medical council (licence) number, signature image
- Report accent color (validated for ≥ 4.5:1 contrast on white; fallback to primary if it fails)
- Optional footer line (website / Instagram handle)
The app brand stays small on reports ("prepared with [APP_NAME]").

## 3. Design tokens (from the mockups in docs/design/screens/)
| Token | Value | Use |
|---|---|---|
| color.primary | #0B6E6E | primary buttons, active states |
| color.primary-hover | #084F4F | hover/pressed |
| color.primary-tint | #E3F1F0 | selected chips, confirm button bg |
| color.primary-ink | #0B5A5A | text on primary-tint |
| color.ink | #15212B | main text |
| color.ink-secondary | #52616B | secondary text (passes 4.5:1 on white and #F4F6F7) |
| color.ink-tertiary | #3B4851 | chip text |
| color.border | #DCE2E6 | card borders |
| color.bg | #F4F6F7 | app background |
| color.surface | #FFFFFF | cards |
| color.chip-neutral | #EEF1F3 | neutral chips |
| color.warn-bg / warn-ink | #FBEEDF / #7A3A06 | warnings, "awaiting sign-off" |
| color.priority-high | #C2410C | high-severity marks |
| color.danger | #B42318 | danger zones, emergency |
| color.capture-bg | #0F171D | camera screen background |
| color.capture-accent | #7FD6D3 | live mask, passed checks |
| radius.sm / md / lg | 10 / 12 / 14 px | chips-buttons / inputs / cards |
| radius.xl | 18–20 px | image panels |
| space | 4-px grid; screen padding 16–20 px; card padding 12–14 px | |
| touch target | ≥ 44 px | all interactive elements |

Dark mode: Phase 2 (capture screen is already dark).

## 4. Typography
- Family: Vazirmatn (variable), fallback Tahoma, sans-serif; Latin also Vazirmatn for consistency
- Scale: 24/700 page title (lists) · 18/700 screen title · 16/600 section/primary button · 15/600 card title · 14/400 body · 13 secondary · 12 caption · 11 minimum (labels only)
- Numbers: Persian digits in fa UI (`Intl.NumberFormat('fa-IR')`), Latin digits in en; measurements always with unit
- Line height 1.6 for Persian body text

## 5. Iconography and imagery
- Stroke icons, 1.8 px, rounded caps (e.g., Lucide). No emoji
- Face illustrations: neutral line drawings; never stock "beauty" photos
- Heat zones: primary (moderate) and priority-high (high) at 20–35 % opacity

## 6. Voice
- Doctor-facing: precise and short. "گودی زیر چشم · درجهٔ 3 از 4 · اطمینان بالا"
- Patient-facing: plain, warm, no jargon, no judgement (see docs/SAFETY.md §3)
- Always state uncertainty plainly: «تقریبی»، «پیشنهاد؛ تصمیم با پزشک»
