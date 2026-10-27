import type { Bi } from '../../analysis/catalog';

/**
 * Treatment knowledge base — typed copy of docs/TREATMENTS.md §2.
 * Volumes, units, product names and evidence grades are intentionally empty (TODO(clinical)).
 * `how` texts describe technique in general terms only and are NOT clinically reviewed.
 */

export type Modality =
  | 'HA'
  | 'biostimulator'
  | 'thread'
  | 'toxin'
  | 'device'
  | 'skinbooster'
  | 'injectable-lipolysis'
  | 'peel'
  | 'laser';

export type Tier = 'minimal' | 'recommended' | 'comprehensive';
export const TIERS: readonly Tier[] = ['minimal', 'recommended', 'comprehensive'];

export type RiskTag = 'high-risk-vascular' | 'fitzpatrick-caution' | 'migration' | 'nodules' | 'ptosis-risk';

export type Area =
  | 'forehead'
  | 'glabella'
  | 'periorbital'
  | 'temple'
  | 'midface'
  | 'perioral'
  | 'lips'
  | 'chin'
  | 'jaw'
  | 'neck'
  | 'skin';

export const AREAS: readonly Area[] = [
  'forehead',
  'glabella',
  'periorbital',
  'temple',
  'midface',
  'perioral',
  'lips',
  'chin',
  'jaw',
  'neck',
  'skin',
];

/** Sequencing stage (docs/TREATMENTS.md §3). */
export type Stage = 'toxin' | 'energy' | 'structure' | 'detail' | 'biostim' | 'booster' | 'lipolysis';

export type TreatmentOption = {
  id: string;
  findingKeys: string[];
  modality: Modality;
  title: Bi;
  how: Bi;
  productClass: string;
  layer?: string;
  tool?: 'needle' | 'cannula' | 'either';
  area: Area;
  stage: Stage;
  /** TODO(clinical) */
  volumeOrUnits?: string;
  sessions?: Bi;
  interval?: Bi;
  duration?: string;
  downtime?: string;
  /** TODO(clinical): evidence grade per option. */
  evidence?: 'strong' | 'moderate' | 'limited';
  riskTags: RiskTag[];
  minTier: Tier;
  sources: string[];
  reviewedBy?: string;
  reviewedAt?: string;
};

const BIOSTIM_SERIES: Pick<TreatmentOption, 'sessions' | 'interval'> = {
  sessions: { fa: '۲ تا ۳ جلسه', en: '2–3 sessions' },
  interval: { fa: 'فاصلهٔ ۴ تا ۶ هفته', en: '4–6 weeks apart' },
};
/** TREATMENTS.md §3.5 — default series, flagged TODO(clinical) confirm. */
const BOOSTER_SERIES: Pick<TreatmentOption, 'sessions' | 'interval'> = {
  sessions: { fa: '۳ جلسه (تأیید پزشک ارشد)', en: '3 sessions (to confirm)' },
  interval: { fa: 'فاصلهٔ ۲ تا ۳ هفته', en: '2–3 weeks apart' },
};

export const TREATMENTS: readonly TreatmentOption[] = [
  // ── Temple ──
  {
    id: 'temple.ha-deep',
    findingKeys: ['temple.hollowing'],
    modality: 'HA',
    title: { fa: 'فیلر ساختاری شقیقه (عمقی)', en: 'Structural HA — deep temple' },
    how: {
      fa: 'HA با استحکام بالا روی پریوست (سوپراپریوستئال) در حفرهٔ تمپورال، با سوزن و آسپیراسیون و تزریق آهسته؛ حمایت قاب بالای صورت و دم ابرو.',
      en: 'High-support HA on bone (supraperiosteal) in the temporal fossa with a needle, aspiration and slow injection; restores the upper-face frame and lateral brow support.',
    },
    productClass: 'HA, high support',
    layer: 'supraperiosteal',
    tool: 'needle',
    area: 'temple',
    stage: 'structure',
    riskTags: ['high-risk-vascular'],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'temple.ha-superficial-cannula',
    findingKeys: ['temple.hollowing'],
    modality: 'HA',
    title: { fa: 'فیلر نرم شقیقه با کانولا (سطحی)', en: 'Soft HA — superficial temple, cannula' },
    how: {
      fa: 'HA نرم در صفحهٔ سطحی (بین فاشیای تمپورال سطحی و عمقی) با کانولا و حرکت فن‌مانند؛ برای صاف‌کردن کانتور.',
      en: 'Soft HA in the superficial plane (between superficial and deep temporal fascia) with a cannula in a fanning pattern to smooth the contour.',
    },
    productClass: 'HA, soft',
    layer: 'interfascial',
    tool: 'cannula',
    area: 'temple',
    stage: 'structure',
    riskTags: ['high-risk-vascular'],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'temple.plla',
    findingKeys: ['temple.hollowing'],
    modality: 'biostimulator',
    title: { fa: 'بیواستیمولاتور شقیقه (PLLA یا CaHA رقیق)', en: 'Temple biostimulator (PLLA or diluted CaHA)' },
    how: {
      fa: 'تحریک تدریجی کلاژن با PLLA یا CaHA رقیق‌شده؛ نتیجه طی چند هفته ظاهر می‌شود و طبیعی‌تر است.',
      en: 'Gradual collagen stimulation with PLLA or diluted CaHA; results build over weeks for a natural look.',
    },
    productClass: 'PLLA / diluted CaHA',
    tool: 'either',
    area: 'temple',
    stage: 'biostim',
    ...BIOSTIM_SERIES,
    riskTags: ['nodules'],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Mid-face ──
  {
    id: 'midface.ha-high-gprime',
    findingKeys: ['midface.volume'],
    modality: 'HA',
    title: { fa: 'فیلر گونه (کانتورینگ میانهٔ صورت)', en: 'Cheek HA (mid-face contouring)' },
    how: {
      fa: 'HA با G′ بالا روی استخوان زیگوما و ماگزیلا از لترال به مدیال؛ ابتدا حمایت ساختاری، سپس پروجکشن. این حمایت معمولاً خط خنده و زیر چشم را هم بهتر می‌کند.',
      en: 'High-G′ HA on zygomatic and maxillary bone, lateral to medial; support first, then projection. Often improves nasolabial folds and tear troughs indirectly.',
    },
    productClass: "HA, high G′",
    layer: 'supraperiosteal',
    tool: 'either',
    area: 'midface',
    stage: 'structure',
    riskTags: [],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'midface.biostim',
    findingKeys: ['midface.volume'],
    modality: 'biostimulator',
    title: { fa: 'بیواستیمولاتور میانهٔ صورت (PLLA یا CaHA)', en: 'Mid-face biostimulator (PLLA or CaHA)' },
    how: {
      fa: 'دوره‌ای از PLLA یا CaHA برای بازسازی تدریجی حجم و کیفیت بافت؛ مکمل یا جایگزین HA در حجم‌دهی منتشر.',
      en: 'A course of PLLA or CaHA to rebuild volume and tissue quality gradually; complements or replaces HA for diffuse deflation.',
    },
    productClass: 'PLLA / CaHA',
    tool: 'either',
    area: 'midface',
    stage: 'biostim',
    ...BIOSTIM_SERIES,
    riskTags: ['nodules'],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'midface.thread-lift',
    findingKeys: ['midface.volume'],
    modality: 'thread',
    title: { fa: 'لیفت با نخ (نخ‌های خاردار PLLA/PCL)', en: 'Thread lift (cogged PLLA/PCL threads)' },
    how: {
      fa: 'نخ‌های خاردار جذبی در زیرجلد، با بردار رو به بالا و عقب برای جابه‌جایی بافت افتاده؛ وقتی افتادگی بیش از کمبود حجم است. اغلب با فیلر ساختاری ترکیب می‌شود.',
      en: 'Absorbable cogged threads in the subcutaneous plane along an up-and-back vector to reposition descended tissue; for ptosis more than deflation. Often combined with structural HA.',
    },
    productClass: 'cogged PLLA/PCL threads',
    layer: 'subcutaneous',
    tool: 'cannula',
    area: 'midface',
    stage: 'structure',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'midface.hifu-rf',
    findingKeys: ['midface.volume'],
    modality: 'device',
    title: { fa: 'سفت‌کردن با HIFU یا RF', en: 'HIFU or RF tightening' },
    how: {
      fa: 'انرژی حرارتی متمرکز (HIFU) یا رادیوفرکانسی برای انقباض و بازسازی کلاژن در لایه‌های عمقی؛ قبل از فیلر یا با فاصلهٔ مناسب.',
      en: 'Focused ultrasound (HIFU) or radiofrequency heating for collagen contraction and remodelling; done before HA or after an interval.',
    },
    productClass: 'energy device',
    area: 'midface',
    stage: 'energy',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Tear trough ──
  {
    id: 'tt.ha-soft-cannula',
    findingKeys: ['teartrough'],
    modality: 'HA',
    title: { fa: 'فیلر زیر چشم با کانولا', en: 'Tear-trough HA with cannula' },
    how: {
      fa: 'HA نرم با چسبندگی کم، عمقی (روی پریوست یا زیر عضلهٔ اربیکولاریس) با کانولا؛ فقط پس از حمایت میانهٔ صورت و در مقادیر کم برای جلوگیری از ادم و اثر تیندال.',
      en: 'Soft, low-cohesivity HA placed deep (preperiosteal / sub-orbicularis) with a cannula; only after mid-face support and conservatively to avoid oedema and Tyndall effect.',
    },
    productClass: 'HA, soft, low cohesivity',
    layer: 'preperiosteal',
    tool: 'cannula',
    area: 'periorbital',
    stage: 'detail',
    riskTags: ['high-risk-vascular'],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'tt.pn',
    findingKeys: ['teartrough'],
    modality: 'skinbooster',
    title: { fa: 'پلی‌نوکلئوتید (PN) زیر چشم', en: 'Polynucleotides (PN) for under-eye skin' },
    how: {
      fa: 'تزریق سطحی پلی‌نوکلئوتید برای بهبود ضخامت، کیفیت و رنگ پوست نازک زیر چشم؛ بدون حجم‌دهی.',
      en: 'Superficial polynucleotide injections to improve thin under-eye skin quality and tone; no volumising.',
    },
    productClass: 'polynucleotides',
    tool: 'needle',
    area: 'periorbital',
    stage: 'booster',
    ...BOOSTER_SERIES,
    riskTags: [],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'tt.rf-microneedling',
    findingKeys: ['teartrough'],
    modality: 'device',
    title: { fa: 'میکرونیدلینگ RF سطحی', en: 'Shallow RF microneedling' },
    how: {
      fa: 'میکرونیدلینگ رادیوفرکانسی کم‌عمق برای سفتی و بافت پوست پلک تحتانی، در ترکیب با سایر روش‌ها.',
      en: 'Shallow radiofrequency microneedling for lower-lid skin tightening and texture, combined with other options.',
    },
    productClass: 'RF microneedling',
    area: 'periorbital',
    stage: 'energy',
    riskTags: ['fitzpatrick-caution'],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Nasolabial ──
  {
    id: 'nl.indirect-midface',
    findingKeys: ['nasolabial'],
    modality: 'HA',
    title: { fa: 'اصلاح غیرمستقیم از طریق گونه', en: 'Indirect correction via mid-face' },
    how: {
      fa: 'به‌جای پر کردن مستقیم خط، حمایت گونه و میانهٔ صورت بازسازی می‌شود تا بافت بالا برود و خط نرم شود؛ نتیجهٔ طبیعی‌تر و بدون سنگینی.',
      en: 'Rather than filling the fold, restore cheek/mid-face support so tissue lifts and the fold softens; more natural, avoids heaviness.',
    },
    productClass: "HA, high G′",
    layer: 'supraperiosteal',
    tool: 'either',
    area: 'midface',
    stage: 'structure',
    riskTags: [],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'nl.ha-medium',
    findingKeys: ['nasolabial'],
    modality: 'HA',
    title: { fa: 'فیلر مستقیم خط خنده', en: 'Direct nasolabial HA' },
    how: {
      fa: 'HA با استحکام متوسط در قاعدهٔ پیریفورم و طول چین، پس از حمایت میانهٔ صورت؛ مسیر شریان فاسیال در این ناحیه پرخطر است.',
      en: 'Medium HA at the piriform base and along the fold after mid-face support; the facial/angular artery runs here (high-risk zone).',
    },
    productClass: 'HA, medium',
    tool: 'either',
    area: 'perioral',
    stage: 'detail',
    riskTags: ['high-risk-vascular'],
    minTier: 'recommended',
    sources: [],
  },
  // ── Marionette ──
  {
    id: 'mar.ha-medium',
    findingKeys: ['marionette'],
    modality: 'HA',
    title: { fa: 'فیلر خطوط ماریونت', en: 'Marionette HA' },
    how: {
      fa: 'HA متوسط زیر گوشهٔ لب و در طول چین برای حمایت گوشهٔ دهان؛ اغلب همراه با فیلر خط فک و چانه.',
      en: 'Medium HA below the mouth corner and along the fold to support the commissure; often combined with jawline and chin HA.',
    },
    productClass: 'HA, medium',
    tool: 'either',
    area: 'perioral',
    stage: 'detail',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'mar.toxin-dao',
    findingKeys: ['marionette'],
    modality: 'toxin',
    title: { fa: 'بوتاکس عضلهٔ DAO', en: 'DAO toxin' },
    how: {
      fa: 'شل کردن عضلهٔ پایین‌کشندهٔ گوشهٔ لب (DAO) تا گوشه‌های دهان کمتر رو به پایین کشیده شوند.',
      en: 'Relaxing the depressor anguli oris so the mouth corners are pulled down less.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'perioral',
    stage: 'toxin',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  // ── Jaw / jowl ──
  {
    id: 'jaw.ha-high-gprime',
    findingKeys: ['jowl', 'jawline.definition'],
    modality: 'HA',
    title: { fa: 'کانتورینگ خط فک و چانه با فیلر', en: 'Jawline & chin contouring with HA' },
    how: {
      fa: 'HA با G′ بالا روی استخوان در زاویهٔ فک، لبهٔ مندیبل (پره‌جول) و چانه؛ خط فک پیوسته و تعریف‌شده می‌شود و جول کمتر دیده می‌شود.',
      en: 'High-G′ HA on bone at the mandibular angle, pre-jowl sulcus and chin; creates a continuous, defined jawline and camouflages jowls.',
    },
    productClass: "HA, high G′",
    layer: 'supraperiosteal',
    tool: 'either',
    area: 'jaw',
    stage: 'structure',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'jaw.threads',
    findingKeys: ['jowl'],
    modality: 'thread',
    title: { fa: 'لیفت فک با نخ (PDO/PLLA)', en: 'Jawline thread lift (PDO/PLLA)' },
    how: {
      fa: 'نخ‌های خاردار در زیرجلد با بردار رو به بالا به سمت ناحیهٔ جلوی گوش برای جابه‌جایی جول؛ مناسب شلی متوسط.',
      en: 'Cogged threads in the subcutaneous plane on an upward vector toward the pre-auricular area to reposition jowls; for moderate laxity.',
    },
    productClass: 'PDO/PLLA cogged threads',
    layer: 'subcutaneous',
    tool: 'cannula',
    area: 'jaw',
    stage: 'structure',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'jaw.caha',
    findingKeys: ['jowl'],
    modality: 'biostimulator',
    title: { fa: 'CaHA خط فک', en: 'Jawline CaHA' },
    how: {
      fa: 'کلسیم هیدروکسی‌آپاتیت برای ساختار و تحریک کلاژن در خط فک؛ استحکام زیاد و دوام مناسب.',
      en: 'Calcium hydroxylapatite for structure and collagen stimulation along the jawline; firm support.',
    },
    productClass: 'CaHA',
    tool: 'either',
    area: 'jaw',
    stage: 'biostim',
    ...BIOSTIM_SERIES,
    riskTags: ['nodules'],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'jaw.toxin-nefertiti',
    findingKeys: ['jowl'],
    modality: 'toxin',
    title: { fa: 'لیفت نفرتیتی (بوتاکس پلاتیسما)', en: 'Nefertiti lift (platysma toxin)' },
    how: {
      fa: 'تزریق بوتاکس در امتداد لبهٔ فک و باندهای پلاتیسما برای کاهش کشش رو به پایین و وضوح بیشتر خط فک.',
      en: 'Toxin along the mandibular border and platysmal bands to reduce downward pull and sharpen the jawline.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'jaw',
    stage: 'toxin',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'jaw.toxin-masseter',
    findingKeys: ['masseter.hypertrophy'],
    modality: 'toxin',
    title: { fa: 'بوتاکس ماستر (باریک‌سازی فک)', en: 'Masseter toxin (jaw slimming)' },
    how: {
      fa: 'بوتاکس در بخش پایینی عضلهٔ ماستر برای کاهش حجم عضله و باریک‌شدن زاویهٔ فک؛ به دندان‌قروچه هم کمک می‌کند.',
      en: 'Toxin into the lower masseter to reduce muscle bulk and slim the jaw angle; may also help bruxism.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'jaw',
    stage: 'toxin',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'jaw.hifu-rf',
    findingKeys: ['jowl', 'jawline.definition'],
    modality: 'device',
    title: { fa: 'HIFU یا RF فک', en: 'Jawline HIFU or RF' },
    how: {
      fa: 'سفت‌کردن غیرتهاجمی بافت در ناحیهٔ فک و زیر چانه با انرژی حرارتی.',
      en: 'Non-invasive thermal tightening of the jawline and submental tissues.',
    },
    productClass: 'energy device',
    area: 'jaw',
    stage: 'energy',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Chin ──
  {
    id: 'chin.ha-high-gprime',
    findingKeys: ['chin.retrusion'],
    modality: 'HA',
    title: { fa: 'فیلر چانه (پروجکشن و طول)', en: 'Chin HA (projection & height)' },
    how: {
      fa: 'HA با G′ بالا روی استخوان چانه (پوگونیون و منتون) برای افزایش پروجکشن یا طول؛ تعادل نیم‌رخ و یک‌سوم تحتانی را بهتر می‌کند.',
      en: 'High-G′ HA on bone at pogonion/menton to add projection or height; balances the profile and lower third.',
    },
    productClass: "HA, high G′",
    layer: 'supraperiosteal',
    tool: 'needle',
    area: 'chin',
    stage: 'structure',
    riskTags: [],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'chin.caha',
    findingKeys: ['chin.retrusion'],
    modality: 'biostimulator',
    title: { fa: 'CaHA چانه', en: 'Chin CaHA' },
    how: { fa: 'CaHA برای ساختار محکم چانه همراه با تحریک کلاژن.', en: 'CaHA for firm chin structure with collagen stimulation.' },
    productClass: 'CaHA',
    tool: 'either',
    area: 'chin',
    stage: 'biostim',
    ...BIOSTIM_SERIES,
    riskTags: ['nodules'],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'chin.toxin-mentalis',
    findingKeys: ['chin.peaudorange'],
    modality: 'toxin',
    title: { fa: 'بوتاکس منتالیس', en: 'Mentalis toxin' },
    how: {
      fa: 'شل کردن عضلهٔ منتالیس برای صاف شدن پوست چانه و کاهش حالت پوست پرتقالی.',
      en: 'Relaxing mentalis to smooth chin skin and reduce dimpling.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'chin',
    stage: 'toxin',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  // ── Lips ──
  {
    id: 'lips.ha-soft',
    findingKeys: ['lips.volume', 'lines.perioral'],
    modality: 'HA',
    title: { fa: 'فیلر لب (مرز و/یا بدنه)', en: 'Lip HA (border and/or body)' },
    how: {
      fa: 'HA نرم برای تعریف مرز ورمیلیون، ستون‌های فیلتروم و/یا حجم بدنه با حفظ نسبت طبیعی لب بالا به پایین؛ شریان لبی در عمق پرخطر است.',
      en: 'Soft HA to define the vermilion border, philtral columns and/or body while keeping the natural upper:lower ratio; labial artery is a high-risk zone.',
    },
    productClass: 'HA, soft',
    tool: 'either',
    area: 'lips',
    stage: 'detail',
    riskTags: ['high-risk-vascular'],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'lips.toxin-flip',
    findingKeys: ['lips.volume'],
    modality: 'toxin',
    title: { fa: 'لیپ فلیپ با بوتاکس', en: 'Lip flip (toxin)' },
    how: {
      fa: 'دوز کم بوتاکس در لبهٔ اربیکولاریس اوریس تا لب بالا کمی به بیرون بچرخد؛ اثر محدود و بدون حجم.',
      en: 'Low-dose toxin at the orbicularis oris border so the upper lip everts slightly; limited effect, no volume.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'lips',
    stage: 'toxin',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Upper face lines ──
  {
    id: 'upper.toxin',
    findingKeys: ['lines.forehead', 'lines.glabella', 'lines.crowsfeet'],
    modality: 'toxin',
    title: { fa: 'بوتاکس بالای صورت (پیشانی، اخم، پنجه‌کلاغی)', en: "Upper-face toxin (forehead, glabella, crow's feet)" },
    how: {
      fa: 'درمان خط اول برای خطوط دینامیک: شل کردن فرونتالیس، کوروگیتور/پروسروس و اربیکولاریس اوکولی با حفظ حرکت طبیعی؛ دقت در پیشانی برای جلوگیری از افتادگی ابرو.',
      en: 'First line for dynamic lines: relaxing frontalis, corrugator/procerus and orbicularis oculi while keeping natural movement; careful forehead dosing to avoid brow ptosis.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'forehead',
    stage: 'toxin',
    riskTags: ['ptosis-risk'],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'upper.ha-very-soft',
    findingKeys: ['lines.static-residual', 'lines.perioral'],
    modality: 'HA',
    title: { fa: 'فیلر بسیار نرم برای خطوط ثابت', en: 'Very soft HA for static lines' },
    how: {
      fa: 'HA بسیار نرم به‌صورت سطحی (بلانچینگ یا میکرودپو) فقط برای خطوطی که بعد از بوتاکس باقی مانده‌اند.',
      en: 'Very soft HA placed superficially (blanching / micro-depots) only for lines remaining after toxin.',
    },
    productClass: 'HA, very soft',
    layer: 'superficial dermal',
    tool: 'needle',
    area: 'forehead',
    stage: 'detail',
    riskTags: ['high-risk-vascular'],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'upper.fractional-laser',
    findingKeys: ['lines.static-residual', 'lines.perioral'],
    modality: 'laser',
    title: { fa: 'لیزر فرکشنال', en: 'Fractional laser' },
    how: {
      fa: 'لیزر فرکشنال برای بازسازی سطح پوست و خطوط ثابت؛ در پوست‌های تیره‌تر با احتیاط و تنظیم پارامترها.',
      en: 'Fractional laser resurfacing for static lines and texture; cautious settings in darker skin types.',
    },
    productClass: 'fractional laser',
    area: 'skin',
    stage: 'energy',
    riskTags: ['fitzpatrick-caution'],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Brow ──
  {
    id: 'brow.toxin-lift',
    findingKeys: ['brow.ptosis'],
    modality: 'toxin',
    title: { fa: 'لیفت شیمیایی ابرو با بوتاکس', en: 'Chemical brow lift (toxin)' },
    how: {
      fa: 'شل کردن عضلات پایین‌کشنده (اربیکولاریس لترال، کوروگیتور) تا دم ابرو کمی بالا بیاید.',
      en: 'Relaxing brow depressors (lateral orbicularis, corrugator) so the brow tail lifts slightly.',
    },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'periorbital',
    stage: 'toxin',
    riskTags: ['ptosis-risk'],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'brow.ha-support',
    findingKeys: ['brow.ptosis'],
    modality: 'HA',
    title: { fa: 'حمایت حجمی ابرو و شقیقه با فیلر', en: 'Brow & temple volume support (HA)' },
    how: {
      fa: 'حجم‌دهی شقیقه و زیر دم ابرو برای حمایت ساختاری ابرو؛ ناحیهٔ عروقی پرخطر.',
      en: 'Volumising the temple and sub-brow to support the brow structurally; high-risk vascular area.',
    },
    productClass: 'HA',
    tool: 'either',
    area: 'temple',
    stage: 'structure',
    riskTags: ['high-risk-vascular'],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'brow.threads',
    findingKeys: ['brow.ptosis'],
    modality: 'thread',
    title: { fa: 'لیفت ابرو با نخ', en: 'Brow thread lift' },
    how: { fa: 'نخ‌های خاردار برای بالا بردن دم ابرو؛ اثر محدود.', en: 'Cogged threads to elevate the brow tail; limited effect.' },
    productClass: 'cogged threads',
    tool: 'cannula',
    area: 'forehead',
    stage: 'structure',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Neck ──
  {
    id: 'neck.lipolysis',
    findingKeys: ['neck.submental-fat'],
    modality: 'injectable-lipolysis',
    title: { fa: 'چربی‌سوزی تزریقی زیر چانه (دئوکسی‌کولیک اسید)', en: 'Submental lipolysis (deoxycholic acid)' },
    how: {
      fa: 'تزریق دئوکسی‌کولیک اسید در چربی زیر چانه برای تخریب سلول‌های چربی؛ دوره‌ای و با تورم موقت.',
      en: 'Deoxycholic acid injected into submental fat to destroy adipocytes; given as a series with temporary swelling.',
    },
    productClass: 'deoxycholic acid',
    tool: 'needle',
    area: 'neck',
    stage: 'lipolysis',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'neck.rf',
    findingKeys: ['neck.submental-fat'],
    modality: 'device',
    title: { fa: 'RF زیر چانه و گردن', en: 'Submental/neck RF' },
    how: { fa: 'رادیوفرکانسی برای سفتی پوست و کاهش ملایم چربی.', en: 'Radiofrequency for skin tightening and mild fat reduction.' },
    productClass: 'energy device',
    area: 'neck',
    stage: 'energy',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'neck.toxin-bands',
    findingKeys: ['neck.platysmal-bands'],
    modality: 'toxin',
    title: { fa: 'بوتاکس باندهای گردن', en: 'Platysmal band toxin' },
    how: { fa: 'تزریق در طول باندهای پلاتیسما برای کاهش برجستگی آن‌ها.', en: 'Injections along platysmal bands to reduce their prominence.' },
    productClass: 'botulinum toxin',
    tool: 'needle',
    area: 'neck',
    stage: 'toxin',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'neck.ha-very-soft',
    findingKeys: ['neck.horizontal-lines'],
    modality: 'HA',
    title: { fa: 'فیلر بسیار نرم یا اسکین‌بوستر خطوط گردن', en: 'Very soft HA or skin booster for neck lines' },
    how: {
      fa: 'HA بسیار نرم یا بوستر به‌صورت میکرودپو در طول خطوط افقی گردن.',
      en: 'Very soft HA or a booster as micro-depots along horizontal neck lines.',
    },
    productClass: 'HA, very soft / booster',
    tool: 'needle',
    area: 'neck',
    stage: 'detail',
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'neck.microtoxin',
    findingKeys: ['neck.horizontal-lines'],
    modality: 'toxin',
    title: { fa: 'میکروبوتاکس گردن', en: 'Neck microtoxin' },
    how: { fa: 'تزریق‌های بسیار سطحی و رقیق بوتاکس برای بافت و خطوط ریز گردن.', en: 'Very superficial diluted toxin for neck texture and fine lines.' },
    productClass: 'botulinum toxin (micro)',
    tool: 'needle',
    area: 'neck',
    stage: 'toxin',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'neck.rf-microneedling',
    findingKeys: ['neck.horizontal-lines'],
    modality: 'device',
    title: { fa: 'میکرونیدلینگ RF گردن', en: 'Neck RF microneedling' },
    how: { fa: 'میکرونیدلینگ رادیوفرکانسی برای سفتی و بافت پوست گردن.', en: 'Radiofrequency microneedling for neck skin tightening and texture.' },
    productClass: 'RF microneedling',
    area: 'neck',
    stage: 'energy',
    riskTags: ['fitzpatrick-caution'],
    minTier: 'comprehensive',
    sources: [],
  },
  // ── Skin ──
  {
    id: 'skin.ha-booster',
    findingKeys: ['skin.quality', 'lines.perioral'],
    modality: 'skinbooster',
    title: { fa: 'اسکین‌بوستر HA', en: 'HA skin booster' },
    how: {
      fa: 'HA غیرکراس‌لینک یا کم‌کراس‌لینک به‌صورت میکروتزریق سطحی برای آبرسانی و درخشش پوست.',
      en: 'Non- or lightly cross-linked HA as superficial micro-injections for hydration and glow.',
    },
    productClass: 'HA skin booster',
    tool: 'either',
    area: 'skin',
    stage: 'booster',
    ...BOOSTER_SERIES,
    riskTags: [],
    minTier: 'minimal',
    sources: [],
  },
  {
    id: 'skin.pn-pdrn',
    findingKeys: ['skin.quality'],
    modality: 'skinbooster',
    title: { fa: 'PN / PDRN (بازسازی پوست)', en: 'PN / PDRN (skin regeneration)' },
    how: {
      fa: 'پلی‌نوکلئوتید یا PDRN برای ترمیم، ضخامت و کیفیت پوست به‌صورت دوره‌ای.',
      en: 'Polynucleotides or PDRN as a course for repair, thickness and skin quality.',
    },
    productClass: 'PN / PDRN',
    tool: 'needle',
    area: 'skin',
    stage: 'booster',
    ...BOOSTER_SERIES,
    riskTags: [],
    minTier: 'recommended',
    sources: [],
  },
  {
    id: 'skin.microtoxin',
    findingKeys: ['skin.quality'],
    modality: 'toxin',
    title: { fa: 'میکروبوتاکس پوست', en: 'Skin microtoxin' },
    how: { fa: 'تزریق سطحی و رقیق برای کاهش منافذ، چربی و خطوط ریز.', en: 'Superficial diluted injections to reduce pores, oiliness and fine lines.' },
    productClass: 'botulinum toxin (micro)',
    tool: 'needle',
    area: 'skin',
    stage: 'toxin',
    riskTags: [],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'skin.laser-peel-rfmn',
    findingKeys: ['skin.quality'],
    modality: 'laser',
    title: { fa: 'لیزر، پیلینگ یا میکرونیدلینگ RF', en: 'Laser, peel or RF microneedling' },
    how: {
      fa: 'بازسازی سطحی پوست بسته به نوع مشکل (بافت، منافذ، شلی)؛ پارامترها با توجه به فیتزپاتریک.',
      en: 'Resurfacing chosen by concern (texture, pores, laxity); parameters adjusted for Fitzpatrick type.',
    },
    productClass: 'laser / peel / RF microneedling',
    area: 'skin',
    stage: 'energy',
    riskTags: ['fitzpatrick-caution'],
    minTier: 'comprehensive',
    sources: [],
  },
  {
    id: 'skin.peel-ipl-laser',
    findingKeys: ['skin.pigmentation'],
    modality: 'peel',
    title: { fa: 'پیلینگ، IPL یا لیزر برای لک', en: 'Peels, IPL or laser for pigmentation' },
    how: {
      fa: 'انتخاب روش بر اساس نوع لک (خورشیدی، ملاسما، قرمزی)؛ در پوست‌های تیره احتیاط ویژه و آماده‌سازی پوست.',
      en: 'Method chosen by pigment type (lentigines, melasma, redness); special caution and skin priming in darker types.',
    },
    productClass: 'peel / IPL / laser',
    area: 'skin',
    stage: 'energy',
    riskTags: ['fitzpatrick-caution'],
    minTier: 'recommended',
    sources: [],
  },
];

export const optionById = (id: string): TreatmentOption | undefined => TREATMENTS.find((o) => o.id === id);
