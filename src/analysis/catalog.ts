import type { FindingTab } from './types';

export type AgeBand = '18-29' | '30-39' | '40-49' | '50-59' | '60+';
export const AGE_BANDS: readonly AgeBand[] = ['18-29', '30-39', '40-49', '50-59', '60+'];

export type Bi = { fa: string; en: string };

export type CatalogEntry = {
  label: Bi;
  tab: FindingTab;
  /** Clinician-graded (docs/ANALYSIS_SPEC.md §6) vs automatic metric. */
  graded: boolean;
  scaleName?: string;
  /** Regional weight for plan priority (docs/TREATMENTS.md §4). TODO(clinical) confirm. */
  weight: number;
  /** Age band in which the change typically becomes visible. TODO(clinical) confirm. */
  onsetBand: AgeBand;
  /** Doctor-facing: what the finding means anatomically. */
  about: Bi;
  /** Patient-facing wording (docs/SAFETY.md §3). */
  patient: Bi;
};

const g = (
  label: Bi,
  tab: FindingTab,
  scaleName: string,
  weight: number,
  onsetBand: AgeBand,
  about: Bi,
  patient: Bi,
): CatalogEntry => ({ label, tab, graded: true, scaleName, weight, onsetBand, about, patient });

const m = (label: Bi, tab: FindingTab, about: Bi, patient: Bi): CatalogEntry => ({
  label,
  tab,
  graded: false,
  weight: 0.5,
  onsetBand: '18-29',
  about,
  patient,
});

export const CATALOG: Record<string, CatalogEntry> = {
  // ── Clinician-graded volume & aging (§6) ─────────────────────────────
  'temple.hollowing': g(
    { fa: 'گودی شقیقه', en: 'Temple hollowing' },
    'volume',
    'Allergan Temple Hollowing Scale',
    0.8,
    '40-49',
    {
      fa: 'کاهش حجم چربی و تحلیل استخوان در حفرهٔ تمپورال؛ قاب بالای صورت را باریک و پیرتر نشان می‌دهد و به افتادگی دم ابرو کمک می‌کند.',
      en: 'Fat and bone volume loss in the temporal fossa; narrows the upper-face frame and contributes to lateral brow descent.',
    },
    { fa: 'ناحیهٔ شقیقه که ممکن است با بازگرداندن حجم، هماهنگ‌تر شود.', en: 'The temple area may benefit from restored volume.' },
  ),
  'midface.volume': g(
    { fa: 'افت حجم میانهٔ صورت', en: 'Mid-face volume loss' },
    'volume',
    'Allergan Mid-Face Volume Deficit Scale',
    1,
    '40-49',
    {
      fa: 'تحلیل و جابه‌جایی پدهای چربی گونه و تحلیل استخوان ماگزیلا؛ زیربنای بیشتر چین‌های پایین‌تر (خط خنده، گودی زیر چشم) است.',
      en: 'Deflation/descent of malar fat pads and maxillary bone resorption; the foundation behind lower-face folds and tear troughs.',
    },
    { fa: 'برجستگی گونه که ممکن است با حمایت ملایم، شاداب‌تر دیده شود.', en: 'The cheek area may look fresher with gentle support.' },
  ),
  teartrough: g(
    { fa: 'گودی زیر چشم', en: 'Tear trough' },
    'volume',
    'Allergan Infraorbital Hollows Scale',
    0.8,
    '30-39',
    {
      fa: 'فرورفتگی در محل اتصال پلک تحتانی و گونه (لیگامان نگه‌دارندهٔ اوربیت)؛ سایه و خستگی ظاهری ایجاد می‌کند.',
      en: 'Depression at the lid–cheek junction (orbital retaining ligament); creates shadowing and a tired look.',
    },
    { fa: 'ناحیهٔ زیر چشم که ممکن است با بهبود، کمتر خسته دیده شود.', en: 'The under-eye area may benefit and look less tired.' },
  ),
  nasolabial: g(
    { fa: 'خط خنده (نازولبیال)', en: 'Nasolabial fold' },
    'volume',
    'Wrinkle Severity Rating Scale (WSRS)',
    0.6,
    '30-39',
    {
      fa: 'عمیق‌شدن چین بین بینی و لب؛ بیشتر پیامد افت حمایت میانهٔ صورت است تا کمبود موضعی.',
      en: 'Deepening of the nose-to-mouth fold; mostly a consequence of lost mid-face support rather than a local deficit.',
    },
    { fa: 'خط بین بینی و لب که ممکن است نرم‌تر شود.', en: 'The line between nose and mouth may be softened.' },
  ),
  marionette: g(
    { fa: 'خطوط ماریونت', en: 'Marionette lines' },
    'volume',
    'Merz Aesthetics Scales — Marionette Lines',
    0.6,
    '40-49',
    {
      fa: 'چین از گوشهٔ لب به پایین؛ ترکیبی از افت حجم، فعالیت عضلهٔ DAO و افتادگی بافت.',
      en: 'Folds descending from the mouth corners; combined volume loss, depressor anguli oris activity and tissue descent.',
    },
    { fa: 'ناحیهٔ گوشهٔ لب که ممکن است حالت آرام‌تری پیدا کند.', en: 'The mouth-corner area may look more relaxed.' },
  ),
  jowl: g(
    { fa: 'افتادگی کنار فک (جول)', en: 'Jowls' },
    'volume',
    'Merz Aesthetics Scales — Jawline',
    0.9,
    '50-59',
    {
      fa: 'نزول چربی و بافت نرم به زیر لبهٔ مندیبل در جلوی لیگامان مندیبولار؛ پیوستگی خط فک را می‌شکند.',
      en: 'Descent of fat and soft tissue below the mandibular border anterior to the mandibular ligament; breaks jawline continuity.',
    },
    { fa: 'خط کنار فک که ممکن است پیوسته‌تر و مرتب‌تر دیده شود.', en: 'The jaw edge may look smoother and more continuous.' },
  ),
  'jawline.definition': g(
    { fa: 'وضوح خط فک', en: 'Jawline definition' },
    'volume',
    'Merz Aesthetics Scales — Jawline',
    0.9,
    '40-49',
    {
      fa: 'کاهش وضوح زاویه و لبهٔ مندیبل (تحلیل استخوان، شلی بافت یا بافت چربی زیاد).',
      en: 'Reduced definition of the mandibular angle and border (bone resorption, laxity or excess fat).',
    },
    { fa: 'خط فک که ممکن است تعریف‌شده‌تر شود.', en: 'The jawline may become more defined.' },
  ),
  'chin.retrusion': g(
    { fa: 'عقب‌بودگی چانه', en: 'Chin retrusion' },
    'volume',
    'Allergan Chin Retrusion Scale',
    0.7,
    '18-29',
    {
      fa: 'کمبود پروجکشن یا طول چانه نسبت به لب و بینی؛ روی تعادل نیم‌رخ و یک‌سوم تحتانی اثر دارد.',
      en: 'Deficient chin projection or height relative to lips and nose; affects profile balance and lower-third proportion.',
    },
    { fa: 'چانه که ممکن است با تعادل بیشتری نسبت به نیم‌رخ دیده شود.', en: 'The chin may be brought into better balance with the profile.' },
  ),
  'chin.peaudorange': g(
    { fa: 'چین‌خوردگی پوست چانه', en: 'Chin dimpling (peau d’orange)' },
    'lips',
    'Clinician 0–4 (chin dimpling)',
    0.4,
    '18-29',
    {
      fa: 'فرورفتگی‌های پوست چانه در اثر فعالیت بیش از حد عضلهٔ منتالیس.',
      en: 'Skin dimpling of the chin from mentalis hyperactivity.',
    },
    { fa: 'پوست چانه که ممکن است صاف‌تر دیده شود.', en: 'The chin skin may look smoother.' },
  ),
  'masseter.hypertrophy': g(
    { fa: 'حجیم بودن عضلهٔ ماستر', en: 'Masseter prominence' },
    'volume',
    'Allergan Masseter Muscle Prominence Scale',
    0.5,
    '18-29',
    {
      fa: 'برجستگی عضلهٔ جونده که پایین صورت را پهن و مربعی نشان می‌دهد؛ گاهی با دندان‌قروچه همراه است.',
      en: 'Prominent masseter widening the lower face (square look); sometimes associated with bruxism.',
    },
    { fa: 'زاویهٔ فک که ممکن است ظریف‌تر دیده شود.', en: 'The jaw angle may appear slimmer.' },
  ),
  'lips.volume': g(
    { fa: 'حجم و تعریف لب', en: 'Lip volume & definition' },
    'lips',
    'Allergan Lip Fullness Scale',
    0.6,
    '40-49',
    {
      fa: 'کاهش حجم بدنه یا وضوح مرز ورمیلیون؛ با افزایش سن لب نازک‌تر و ستون‌های فیلتروم صاف‌تر می‌شوند.',
      en: 'Reduced body volume or vermilion border definition; lips thin and philtral columns flatten with age.',
    },
    { fa: 'لب‌ها که ممکن است با تعریف و هماهنگی بیشتری دیده شوند.', en: 'The lips may benefit from more definition and balance.' },
  ),
  'lines.perioral': g(
    { fa: 'خطوط دور لب', en: 'Perioral lines' },
    'lips',
    'Merz Aesthetics Scales — Perioral Lines at Rest',
    0.5,
    '50-59',
    {
      fa: 'خطوط عمودی لب بالا و پایین؛ ترکیب فعالیت اربیکولاریس، آسیب نوری و کاهش کیفیت پوست.',
      en: 'Vertical upper/lower lip lines; orbicularis activity, photodamage and reduced skin quality.',
    },
    { fa: 'پوست دور لب که ممکن است لطیف‌تر شود.', en: 'The skin around the lips may become smoother.' },
  ),
  'brow.ptosis': g(
    { fa: 'افتادگی ابرو', en: 'Brow ptosis' },
    'dynamics',
    'Merz Brow Positioning Grading Scale',
    0.6,
    '40-49',
    {
      fa: 'نزول دم ابرو (اغلب لترال) به‌علت افت حجم شقیقه و غلبهٔ عضلات پایین‌کشنده؛ نگاه را خسته نشان می‌دهد.',
      en: 'Descent of the (usually lateral) brow from temple deflation and depressor dominance; gives a tired look.',
    },
    { fa: 'موقعیت ابرو که ممکن است بازتر و شاداب‌تر دیده شود.', en: 'The brow position may look more open and refreshed.' },
  ),
  'lines.forehead': g(
    { fa: 'خطوط پیشانی', en: 'Forehead lines' },
    'dynamics',
    'Merz Aesthetics Scales — Forehead Lines',
    0.6,
    '30-39',
    { fa: 'خطوط افقی دینامیک ناشی از عضلهٔ فرونتالیس.', en: 'Horizontal dynamic lines from the frontalis muscle.' },
    { fa: 'خطوط پیشانی که ممکن است نرم‌تر شوند.', en: 'Forehead lines may be softened.' },
  ),
  'lines.glabella': g(
    { fa: 'خطوط اخم (گلابلا)', en: 'Glabellar lines' },
    'dynamics',
    'Merz Aesthetics Scales — Glabella Lines',
    0.6,
    '30-39',
    {
      fa: 'خطوط عمودی بین ابروها از کوروگیتور و پروسروس؛ حالت اخم یا نگرانی منتقل می‌کنند.',
      en: 'Vertical lines between the brows from corrugator/procerus; convey a frowning or worried look.',
    },
    { fa: 'ناحیهٔ بین ابروها که ممکن است آرام‌تر دیده شود.', en: 'The area between the brows may look calmer.' },
  ),
  'lines.crowsfeet': g(
    { fa: 'خطوط پنجه‌کلاغی', en: "Crow's feet" },
    'dynamics',
    'Merz Aesthetics Scales — Lateral Canthal Lines',
    0.6,
    '30-39',
    { fa: 'خطوط کنار چشم از عضلهٔ اربیکولاریس اوکولی.', en: 'Lateral canthal lines from orbicularis oculi.' },
    { fa: 'خطوط کنار چشم که ممکن است ملایم‌تر شوند.', en: 'The lines at the eye corners may be softened.' },
  ),
  'lines.static-residual': g(
    { fa: 'خطوط ثابت باقی‌مانده', en: 'Residual static lines' },
    'dynamics',
    'Clinician 0–4 (static lines at rest)',
    0.5,
    '50-59',
    {
      fa: 'خطوطی که در حالت استراحت هم دیده می‌شوند و فقط با شل کردن عضله برطرف نمی‌شوند.',
      en: 'Lines visible at rest that do not resolve with muscle relaxation alone.',
    },
    { fa: 'خطوط ثابت که ممکن است کم‌رنگ‌تر شوند.', en: 'Lines at rest may become less visible.' },
  ),
  'neck.submental-fat': g(
    { fa: 'چربی زیر چانه', en: 'Submental fullness' },
    'volume',
    'Clinician-Reported Submental Fat Rating Scale',
    0.7,
    '18-29',
    {
      fa: 'تجمع چربی زیر چانه که زاویهٔ گردن-چانه را پر می‌کند.',
      en: 'Submental fat accumulation blunting the cervicomental angle.',
    },
    { fa: 'زیر چانه که ممکن است خوش‌فرم‌تر شود.', en: 'The under-chin area may become better defined.' },
  ),
  'neck.platysmal-bands': g(
    { fa: 'باندهای پلاتیسما', en: 'Platysmal bands' },
    'dynamics',
    'Allergan Platysma Prominence Scale',
    0.7,
    '50-59',
    { fa: 'نوارهای عمودی گردن از عضلهٔ پلاتیسما.', en: 'Vertical neck bands from the platysma muscle.' },
    { fa: 'نوارهای گردن که ممکن است کمتر دیده شوند.', en: 'The neck bands may become less visible.' },
  ),
  'neck.horizontal-lines': g(
    { fa: 'خطوط افقی گردن', en: 'Horizontal neck lines' },
    'volume',
    'Merz Aesthetics Scales — Horizontal Neck Lines',
    0.7,
    '40-49',
    { fa: 'خطوط حلقوی گردن؛ ترکیب ژنتیک، وضعیت بدن و کاهش کیفیت پوست.', en: 'Circumferential neck lines; genetics, posture and skin quality.' },
    { fa: 'خطوط گردن که ممکن است کم‌رنگ‌تر شوند.', en: 'Neck lines may become less visible.' },
  ),
  'skin.quality': g(
    { fa: 'کیفیت پوست (خطوط ریز، منافذ، بافت، شلی)', en: 'Skin quality (fine lines, pores, texture, laxity)' },
    'skin',
    'Glogau photoaging (I–IV) + clinician 0–4',
    0.6,
    '30-39',
    {
      fa: 'کاهش آبرسانی، کلاژن و الاستین؛ بافت ناصاف، منافذ باز و خطوط ریز.',
      en: 'Reduced hydration, collagen and elastin; uneven texture, enlarged pores and fine lines.',
    },
    { fa: 'پوست که ممکن است شاداب‌تر و یکدست‌تر شود.', en: 'The skin may look fresher and more even.' },
  ),
  'skin.pigmentation': g(
    { fa: 'لک و ناهمگونی رنگ', en: 'Pigmentation & redness' },
    'skin',
    'Clinician 0–4 (dyschromia)',
    0.5,
    '30-39',
    { fa: 'لک‌های خورشیدی، ملاسما یا قرمزی منتشر.', en: 'Solar lentigines, melasma or diffuse redness.' },
    { fa: 'رنگ پوست که ممکن است یکدست‌تر شود.', en: 'Skin tone may become more even.' },
  ),

  // ── Automatic metrics (§4) ───────────────────────────────────────────
  'thirds.middleToLower': m(
    { fa: 'نسبت یک‌سوم میانی به تحتانی', en: 'Middle-to-lower third ratio' },
    'proportions',
    { fa: 'گلابلا تا ساب‌نازال تقسیم بر ساب‌نازال تا منتون.', en: 'Glabella–subnasale divided by subnasale–menton.' },
    { fa: 'تناسب عمودی صورت', en: 'Vertical facial balance' },
  ),
  'lowerFace.ratio': m(
    { fa: 'نسبت لب بالا به چانه', en: 'Lower-face ratio' },
    'proportions',
    { fa: 'ساب‌نازال تا استومیون تقسیم بر استومیون تا منتون (ایده‌آل ≈ ۱:۲).', en: 'Subnasale–stomion / stomion–menton (≈ 1:2).' },
    { fa: 'تناسب پایین صورت', en: 'Lower-face balance' },
  ),
  fifths: m(
    { fa: 'پنج‌قسمتی عرضی', en: 'Facial fifths' },
    'proportions',
    { fa: 'پنج عرض افقی تقسیم بر میانگین عرض چشم؛ مقدار = بیشترین انحراف از ۱.', en: 'Five horizontal widths / mean eye width; value = largest deviation from 1.' },
    { fa: 'تناسب عرضی صورت', en: 'Horizontal facial balance' },
  ),
  'intercanthal.ratio': m(
    { fa: 'فاصلهٔ بین دو چشم', en: 'Intercanthal ratio' },
    'proportions',
    { fa: 'فاصلهٔ گوشه‌های داخلی چشم تقسیم بر عرض چشم.', en: 'Inner-corner distance / eye width.' },
    { fa: 'فاصلهٔ چشم‌ها', en: 'Eye spacing' },
  ),
  'canthalTilt.R': m(
    { fa: 'شیب چشم راست', en: 'Canthal tilt (right)' },
    'proportions',
    { fa: 'زاویهٔ گوشهٔ داخلی به خارجی نسبت به افق؛ مثبت = گوشهٔ خارجی بالاتر.', en: 'Inner→outer corner angle to horizontal; positive = outer corner higher.' },
    { fa: 'شیب چشم', en: 'Eye tilt' },
  ),
  'canthalTilt.L': m(
    { fa: 'شیب چشم چپ', en: 'Canthal tilt (left)' },
    'proportions',
    { fa: 'زاویهٔ گوشهٔ داخلی به خارجی نسبت به افق؛ مثبت = گوشهٔ خارجی بالاتر.', en: 'Inner→outer corner angle to horizontal; positive = outer corner higher.' },
    { fa: 'شیب چشم', en: 'Eye tilt' },
  ),
  'nose.width': m(
    { fa: 'پهنای بینی', en: 'Nasal width' },
    'proportions',
    { fa: 'فاصلهٔ دو پرهٔ بینی تقسیم بر فاصلهٔ بین دو چشم.', en: 'Alar width / intercanthal distance.' },
    { fa: 'پهنای بینی', en: 'Nose width' },
  ),
  'faceShape.bizygomaticToBigonial': m(
    { fa: 'شکل صورت (گونه به فک)', en: 'Face shape (bizygomatic / bigonial)' },
    'proportions',
    { fa: 'توصیفی؛ عدد بزرگ‌تر = پایین صورت باریک‌تر (V-shape). ایده‌آل واحد ندارد.', en: 'Descriptive; larger = more tapered lower face. No single ideal.' },
    { fa: 'شکل کلی صورت', en: 'Overall face shape' },
  ),
  'lips.upperToLower': m(
    { fa: 'نسبت لب بالا به پایین', en: 'Upper-to-lower lip ratio' },
    'lips',
    { fa: 'ارتفاع لب بالا تقسیم بر لب پایین (مرجع ≈ ۱:۱٫۶).', en: 'Upper / lower vermilion height (≈ 1:1.6).' },
    { fa: 'تناسب لب‌ها', en: 'Lip balance' },
  ),
  'mouth.width': m(
    { fa: 'عرض دهان', en: 'Mouth width' },
    'lips',
    { fa: 'عرض دهان تقسیم بر فاصلهٔ لبه‌های داخلی عنبیه.', en: 'Mouth width / distance between medial iris edges.' },
    { fa: 'عرض دهان', en: 'Mouth width' },
  ),
  'brow.asymmetry': m(
    { fa: 'اختلاف ارتفاع ابروها', en: 'Brow height difference' },
    'proportions',
    { fa: 'اختلاف فاصلهٔ بالاترین نقطهٔ ابرو تا مرکز مردمک، راست و چپ (کالیبره با عنبیه).', en: 'R vs L brow-peak-to-pupil distance (iris-calibrated).' },
    { fa: 'هماهنگی ابروها', en: 'Brow balance' },
  ),
  'symmetry.brows': m(
    { fa: 'قرینگی ابروها', en: 'Brow symmetry' },
    'proportions',
    { fa: 'اختلاف نسبی فاصلهٔ نقاط جفت تا خط میانی.', en: 'Relative difference of paired-point distances to the midline.' },
    { fa: 'قرینگی', en: 'Symmetry' },
  ),
  'symmetry.eyes': m(
    { fa: 'قرینگی چشم‌ها', en: 'Eye symmetry' },
    'proportions',
    { fa: 'اختلاف نسبی فاصلهٔ نقاط جفت تا خط میانی.', en: 'Relative difference of paired-point distances to the midline.' },
    { fa: 'قرینگی', en: 'Symmetry' },
  ),
  'symmetry.cheeks': m(
    { fa: 'قرینگی گونه‌ها', en: 'Cheek symmetry' },
    'proportions',
    { fa: 'اختلاف نسبی فاصلهٔ نقاط جفت تا خط میانی.', en: 'Relative difference of paired-point distances to the midline.' },
    { fa: 'قرینگی', en: 'Symmetry' },
  ),
  'symmetry.mouth': m(
    { fa: 'قرینگی دهان', en: 'Mouth symmetry' },
    'proportions',
    { fa: 'اختلاف نسبی فاصلهٔ گوشه‌های لب تا خط میانی.', en: 'Relative difference of mouth-corner distances to the midline.' },
    { fa: 'قرینگی', en: 'Symmetry' },
  ),
  'symmetry.jaw': m(
    { fa: 'قرینگی فک', en: 'Jaw symmetry' },
    'proportions',
    { fa: 'اختلاف نسبی فاصلهٔ زاویه‌های فک تا خط میانی.', en: 'Relative difference of jaw-angle distances to the midline.' },
    { fa: 'قرینگی', en: 'Symmetry' },
  ),
};

export const GRADED_KEYS = Object.keys(CATALOG).filter((k) => CATALOG[k]!.graded);

export function ageBandOf(age: number): AgeBand {
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  return '60+';
}

export const bandIndex = (b: AgeBand): number => AGE_BANDS.indexOf(b);
