# Brand and design system

## 1. Product brand
- Working name: `[APP_NAME]` (placeholder). Name ideas to check for trademark/domain availability before use:
  "Chehreh Pro" (چهره‌پرو), "Tanasob" (تناسب), "Proporta"
- Positioning (fa): «دستیار آنالیز و برنامه‌ریزی درمان زیبایی، ویژهٔ پزشک»
- Positioning (en): "Measured aesthetic analysis and treatment planning for physicians"
- Working name in the app: «تناسب» / Tanasob (trademark check still pending)
- Personality: clinical, calm, precise, respectful; premium black & gold look, never a "beauty filter"
- Logo: wordmark in Vazirmatn 700 + a simple mark (face outline with a vertical midline and three horizontal thirds lines). Placeholder until designed

## 2. Clinic / doctor branding (white-label, in Settings)
Shown on the patient report and the app header:
- Clinic logo (PNG/SVG, max 512 px), clinic name, address, phone
- Doctor name, title, medical council (licence) number, signature image
- Report accent color (validated for ≥ 4.5:1 contrast on white; fallback to primary if it fails)
- Optional footer line (website / Instagram handle)
The app brand stays small on reports ("prepared with [APP_NAME]").

## 3. Design tokens — BLACK & GOLD (decided 2026-10-27, replaces the teal mockup palette)
The mockups in docs/design/screens/ remain the reference for layout and hierarchy only; colours come from
this table (source of truth in `tailwind.config.ts`).

| Token | Value | Use |
|---|---|---|
| bg | #0A0A0B | app background |
| surface / surface-2 | #141416 / #1C1C20 | cards / inputs, inactive chips |
| border | #2C2A26 | card borders |
| ink | #F4EFE4 | main text |
| ink-secondary | #B5AE9F | secondary text (≥ 4.5:1 on bg and surface) |
| ink-tertiary | #8C8577 | captions |
| gold | #D4AF37 | primary accent, active states, mask, focus ring |
| gold-hover / gold-deep | #E6C65C / #A8862A | hover / gradient end |
| gold-tint / gold-ink | #2A2414 / #F1D98A | selected chips bg / text on tint |
| primary button | gradient #F1D98A → #D4AF37 → #A8862A, text #0A0A0B | |
| warn bg / ink | #3A2A10 / #F5C26B | warnings |
| priority | #F08A4B | high-severity marks |
| danger | #F0524F | danger zones, emergency |
| ok | #7FD6A0 | passed checks |
| radius.sm / md / lg / xl | 10 / 12 / 14 / 20 px | chips-buttons / inputs / cards / image panels |
| touch target | ≥ 44 px | all interactive elements |

Printed patient reports stay light (white paper) with the clinic accent; default report accent #7A5F12
(dark gold, 6:1 on white). Accents under 4.5:1 fall back automatically.

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
