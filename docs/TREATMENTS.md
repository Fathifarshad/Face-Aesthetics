# Treatment knowledge base (Phase 1 seed)

Convert this file into typed data in `src/plan/data/treatments.ts`. Every option keeps its `id`.
Volumes, units and product names are deliberately NOT filled: they come from the clinical lead
(`TODO(clinical)`). The engine must work with those fields empty (show "per clinician").
Each option carries `reviewedBy` / `reviewedAt` — the UI shows "not yet clinically reviewed" while empty.

## 1. Option schema
```ts
type TreatmentOption = {
  id: string;                 // e.g. "tt.ha-soft-cannula"
  findingKeys: string[];      // which findings it addresses
  modality: "HA" | "biostimulator" | "thread" | "toxin" | "device" | "skinbooster" | "injectable-lipolysis" | "peel" | "laser";
  title_fa: string; title_en: string;
  productClass: string;       // e.g. "HA, low-cohesivity, soft"
  layer?: string; tool?: "needle" | "cannula" | "either";
  volumeOrUnits?: string;     // TODO(clinical)
  sessions: string; interval?: string; duration?: string; downtime?: string;
  evidence: "strong" | "moderate" | "limited";
  riskTags: ("high-risk-vascular" | "fitzpatrick-caution" | "migration" | "nodules" | "ptosis-risk")[];
  contraindications: string[]; // keys from intake (docs/SAFETY.md §2)
  minTier: "minimal" | "recommended" | "comprehensive";
  sources: string[];          // PubMed IDs / guideline names, filled by clinical lead
  reviewedBy?: string; reviewedAt?: string;
};
```

## 2. Options by finding
| Finding key | Option id | Modality | Summary | minTier | Risk tags |
|---|---|---|---|---|---|
| temple.hollowing | temple.ha-deep | HA | structural HA, deep (supraperiosteal) | recommended | high-risk-vascular |
| temple.hollowing | temple.ha-superficial-cannula | HA | soft HA, superficial plane, cannula | comprehensive | high-risk-vascular |
| temple.hollowing | temple.plla | biostimulator | PLLA or diluted CaHA, series | comprehensive | nodules |
| midface.volume | midface.ha-high-gprime | HA | high-G′ HA on bone, lateral → medial | minimal | |
| midface.volume | midface.biostim | biostimulator | PLLA or CaHA series | recommended | nodules |
| midface.volume | midface.thread-lift | thread | cogged PLLA/PCL threads for lift | comprehensive | |
| midface.volume | midface.hifu-rf | device | HIFU or RF tightening | comprehensive | |
| teartrough | tt.ha-soft-cannula | HA | soft, low-cohesivity HA, deep, cannula; after mid-face support | recommended | high-risk-vascular |
| teartrough | tt.pn | skinbooster | polynucleotides for skin quality | minimal | |
| teartrough | tt.rf-microneedling | device | shallow RF microneedling, combined | comprehensive | fitzpatrick-caution |
| nasolabial | nl.indirect-midface | HA | correct indirectly via mid-face first | minimal | |
| nasolabial | nl.ha-medium | HA | medium HA directly, after mid-face | recommended | high-risk-vascular |
| marionette | mar.ha-medium | HA | medium HA | recommended | |
| marionette | mar.toxin-dao | toxin | DAO relaxation | recommended | |
| jowl | jaw.ha-high-gprime | HA | high-G′ HA at jaw angle and chin | recommended | |
| jowl | jaw.threads | thread | PDO/PLLA threads | comprehensive | |
| jowl | jaw.caha | biostimulator | CaHA | comprehensive | nodules |
| jowl | jaw.toxin-nefertiti | toxin | Nefertiti lift (platysma) | comprehensive | |
| jawline.definition | jaw.ha-high-gprime | HA | (shared option) | recommended | |
| masseter.hypertrophy | jaw.toxin-masseter | toxin | masseter slimming | recommended | |
| jowl / jawline | jaw.hifu-rf | device | HIFU or RF | comprehensive | |
| chin.retrusion | chin.ha-high-gprime | HA | high-G′ HA on bone | minimal | |
| chin.retrusion | chin.caha | biostimulator | CaHA | comprehensive | |
| chin.peaudorange | chin.toxin-mentalis | toxin | mentalis relaxation | recommended | |
| lips.volume | lips.ha-soft | HA | soft HA: border and/or body | minimal | high-risk-vascular |
| lips.volume | lips.toxin-flip | toxin | lip flip (limited) | comprehensive | |
| lines.forehead | upper.toxin | toxin | first line for dynamic lines (forehead, glabella, crow's feet) | minimal | ptosis-risk |
| lines.glabella | upper.toxin | toxin | (shared) | minimal | ptosis-risk |
| lines.crowsfeet | upper.toxin | toxin | (shared) | minimal | |
| lines.static-residual | upper.ha-very-soft | HA | very soft HA for residual static lines only | comprehensive | high-risk-vascular |
| lines.static-residual | upper.fractional-laser | laser | fractional laser | comprehensive | fitzpatrick-caution |
| brow.ptosis | brow.toxin-lift | toxin | chemical brow lift | recommended | ptosis-risk |
| brow.ptosis | brow.ha-support | HA | temple/brow volume support | comprehensive | high-risk-vascular |
| brow.ptosis | brow.threads | thread | limited | comprehensive | |
| neck.submental-fat | neck.lipolysis | injectable-lipolysis | deoxycholic acid | recommended | |
| neck.submental-fat | neck.rf | device | RF | comprehensive | |
| neck.platysmal-bands | neck.toxin-bands | toxin | platysmal bands | recommended | |
| neck.horizontal-lines | neck.ha-very-soft | HA | very soft HA or skin booster | recommended | |
| neck.horizontal-lines | neck.microtoxin | toxin | microtoxin | comprehensive | |
| neck.horizontal-lines | neck.rf-microneedling | device | RF microneedling | comprehensive | fitzpatrick-caution |
| skin.quality | skin.ha-booster | skinbooster | HA skin booster | minimal | |
| skin.quality | skin.pn-pdrn | skinbooster | PN/PDRN | recommended | |
| skin.quality | skin.microtoxin | toxin | microtoxin | comprehensive | |
| skin.quality | skin.laser-peel-rfmn | laser | laser, peel or RF microneedling | comprehensive | fitzpatrick-caution |
| skin.pigmentation | skin.peel-ipl-laser | peel | peels, IPL, lasers (care in high Fitzpatrick) | recommended | fitzpatrick-caution |

### 2.1 Additions in the prototype (2026-10-27, `reviewed: false`)
- `lines.perioral` (clinician-graded) maps to `lips.ha-soft`, `upper.ha-very-soft`, `upper.fractional-laser`, `skin.ha-booster`
- Every option has a short `how` text (technique in general terms: product class, plane, tool, sequencing) — no
  doses, volumes or units. Clinical lead to review wording before real use
- Option `area` and `stage` fields drive contraindication-by-area and session sequencing
- Soft flags also added for `isotretinoin_6m` (devices/lasers/peels), `neuromuscular_disease` (toxin) and
  `allergy_lidocaine` (HA/boosters → lidocaine-free product) — `TODO(clinical)` confirm hard vs soft

## 3. Sequencing rules (engine)
1. Structure before detail: temple, mid-face, chin, jaw in an earlier session than nasolabial, lips, tear trough
2. Toxin 1–2 weeks before HA in dynamic areas (e.g., crow's feet before tear trough)
3. Thermal devices before HA, or after an interval per manufacturer instructions (interval value `TODO(clinical)`)
4. Biostimulators: 2–3 sessions, 4–6 weeks apart; shown as gradual in the timeline
5. Skin boosters/PN: series per product (default 3 sessions, 2–3 weeks apart — `TODO(clinical)` confirm)
6. Session cap: total HA volume and number of high-risk-vascular zones per session limited by clinic settings; exceeding → warning, never silent
7. One high-risk-vascular zone per session by default (configurable)

## 4. Tier and age logic
- Tier filter: show options with minTier ≤ selected tier
- Priority score per finding = severity × regional weight × age factor
  - age factor: findings typical of the target age band are de-prioritized (natural look); findings typical of older bands are prioritized
  - default regional weights: mid-face 1.0, temple 0.8, jawline/jowl 0.9, tear trough 0.8, nasolabial 0.6, lips 0.6, neck 0.7 (`TODO(clinical)` confirm)
- Target gap = actual age − target age: 0–3 → minimal default, 4–8 → recommended, 9+ → comprehensive (doctor can override)

## 5. Contraindication handling
- Hard block (option hidden): pregnancy/breastfeeding for all injectables; active infection at site; known allergy to a component
- Soft flag (option shown with warning): anticoagulants, autoimmune disease, history of herpes (perioral), keloid tendency (needling/threads), recent filler in same area (< interval), permanent filler in area, high Fitzpatrick (energy devices, peels)
- Exact mapping table is reviewed by the clinical lead before real use
