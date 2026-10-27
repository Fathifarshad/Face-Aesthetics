import type { Bi } from '../analysis/catalog';

export type ViewId =
  | 'frontal'
  | 'oblique-r'
  | 'oblique-l'
  | 'profile-r'
  | 'profile-l'
  | 'smile'
  | 'frown'
  | 'brows-raised'
  | 'lips-pursed'
  | 'submental'
  | 'clench-neck';

export type ViewDef = {
  id: ViewId;
  label: Bi;
  expression: 'neutral' | 'smile' | 'frown' | 'brows' | 'pursed' | 'clench';
  /** Absolute yaw target in degrees; direction is shown but not enforced until the sign is verified (M1). */
  yaw: number;
  tolerance: number;
  /** Frontal-type views get the face-size check (docs/ANALYSIS_SPEC.md §2). */
  frontal: boolean;
  /** Landmark detection may fail; allow manual acceptance. */
  manualAllowed: boolean;
  guide: Bi;
};

/** docs/ANALYSIS_SPEC.md §2 — 11 standard views. */
export const VIEWS: readonly ViewDef[] = [
  {
    id: 'frontal',
    label: { fa: 'روبه‌رو — بی‌حالت', en: 'Frontal — neutral' },
    expression: 'neutral',
    yaw: 0,
    tolerance: 3,
    frontal: true,
    manualAllowed: false,
    guide: {
      fa: 'مستقیم به لنز نگاه کنید، چانه موازی زمین، لب‌ها بسته و صورت کاملاً بی‌حالت. دو گوش باید به یک اندازه دیده شوند.',
      en: 'Look straight into the lens, chin level, lips closed, fully relaxed face. Both ears should look equal.',
    },
  },
  {
    id: 'oblique-r',
    label: { fa: '۴۵ درجه — سمت راست', en: '45° — right side' },
    expression: 'neutral',
    yaw: 45,
    tolerance: 5,
    frontal: false,
    manualAllowed: false,
    guide: {
      fa: 'سر را ۴۵ درجه بچرخانید تا سمت راست صورت به دوربین باشد؛ نوک بینی تقریباً روی خط گونهٔ مقابل قرار گیرد. شانه‌ها هم‌راستای سر.',
      en: 'Turn the head 45° so the right side faces the camera; the nose tip should almost touch the far cheek line. Shoulders follow the head.',
    },
  },
  {
    id: 'oblique-l',
    label: { fa: '۴۵ درجه — سمت چپ', en: '45° — left side' },
    expression: 'neutral',
    yaw: 45,
    tolerance: 5,
    frontal: false,
    manualAllowed: false,
    guide: {
      fa: 'همان حالت قبل، این بار سمت چپ صورت به دوربین.',
      en: 'Same as before, now with the left side toward the camera.',
    },
  },
  {
    id: 'profile-r',
    label: { fa: 'نیم‌رخ — راست', en: 'Profile — right' },
    expression: 'neutral',
    yaw: 90,
    tolerance: 5,
    frontal: false,
    manualAllowed: true,
    guide: {
      fa: 'کاملاً نیم‌رخ؛ فقط یک چشم دیده شود. گوش آزاد از مو، نگاه به روبه‌رو، گردن صاف (نه جلو و نه عقب).',
      en: 'Full profile; only one eye visible. Ear clear of hair, gaze straight ahead, neck neutral.',
    },
  },
  {
    id: 'profile-l',
    label: { fa: 'نیم‌رخ — چپ', en: 'Profile — left' },
    expression: 'neutral',
    yaw: 90,
    tolerance: 5,
    frontal: false,
    manualAllowed: true,
    guide: { fa: 'همان حالت نیم‌رخ از سمت چپ.', en: 'Same profile position from the left side.' },
  },
  {
    id: 'smile',
    label: { fa: 'روبه‌رو — لبخند کامل', en: 'Frontal — full smile' },
    expression: 'smile',
    yaw: 0,
    tolerance: 3,
    frontal: true,
    manualAllowed: false,
    guide: {
      fa: 'لبخند کامل و طبیعی با نمایش دندان‌ها؛ برای ارزیابی پنجه‌کلاغی، لثه و حرکت گونه.',
      en: "Full natural smile showing teeth; used for crow's feet, gum show and cheek movement.",
    },
  },
  {
    id: 'frown',
    label: { fa: 'روبه‌رو — اخم', en: 'Frontal — frown' },
    expression: 'frown',
    yaw: 0,
    tolerance: 3,
    frontal: true,
    manualAllowed: false,
    guide: { fa: 'حداکثر اخم (ابروها به هم نزدیک)؛ برای خطوط گلابلا.', en: 'Maximum frown (brows pulled together); for glabellar lines.' },
  },
  {
    id: 'brows-raised',
    label: { fa: 'روبه‌رو — ابرو بالا', en: 'Frontal — brows raised' },
    expression: 'brows',
    yaw: 0,
    tolerance: 3,
    frontal: true,
    manualAllowed: false,
    guide: { fa: 'ابروها را تا حد ممکن بالا ببرید؛ برای خطوط پیشانی.', en: 'Raise the brows as high as possible; for forehead lines.' },
  },
  {
    id: 'lips-pursed',
    label: { fa: 'روبه‌رو — غنچه کردن لب', en: 'Frontal — lips pursed' },
    expression: 'pursed',
    yaw: 0,
    tolerance: 3,
    frontal: true,
    manualAllowed: false,
    guide: { fa: 'لب‌ها را مثل سوت زدن جمع کنید؛ برای خطوط دور لب و چانه.', en: 'Purse the lips as if whistling; for perioral lines and chin dimpling.' },
  },
  {
    id: 'submental',
    label: { fa: 'زیر چانه', en: 'Submental' },
    expression: 'neutral',
    yaw: 0,
    tolerance: 5,
    frontal: false,
    manualAllowed: true,
    guide: {
      fa: 'سر را به عقب خم کنید و دوربین را پایین‌تر از چانه نگه دارید تا زیر چانه و گردن دیده شود. زاویهٔ دقیق: TODO پزشک ارشد.',
      en: 'Tilt the head back with the camera below the chin so the under-chin and neck are visible. Exact angle: TODO(clinical).',
    },
  },
  {
    id: 'clench-neck',
    label: { fa: 'دندان روی هم + گردن منقبض', en: 'Teeth clenched + neck tensed' },
    expression: 'clench',
    yaw: 0,
    tolerance: 3,
    frontal: true,
    manualAllowed: false,
    guide: {
      fa: 'دندان‌ها را محکم روی هم فشار دهید و گوشه‌های لب را پایین بکشید تا عضلهٔ ماستر و باندهای گردن دیده شوند.',
      en: 'Clench the teeth and pull the mouth corners down to show masseters and platysmal bands.',
    },
  },
];

export const viewById = (id: string): ViewDef | undefined => VIEWS.find((v) => v.id === id);

/** General photography rules shown above every capture session. */
export const PHOTO_RULES: readonly Bi[] = [
  { fa: 'پس‌زمینهٔ ساده و یکدست (ترجیحاً تیره یا خاکستری)', en: 'Plain, even background (dark or grey preferred)' },
  { fa: 'نور نرم و یکنواخت از روبه‌رو (پنجره یا رینگ‌لایت)؛ بدون نور پشت سر', en: 'Soft even light from the front (window or ring light); no light behind' },
  { fa: 'بدون آرایش، عینک، گوشواره و فیلتر زیبایی؛ موها پشت گوش', en: 'No makeup, glasses, earrings or beauty filters; hair behind the ears' },
  { fa: 'دوربین هم‌سطح چشم، لنز اصلی (۱x یا ۲x)، بدون واید', en: 'Camera at eye level, main lens (1x or 2x), no wide-angle' },
  { fa: 'عکس‌های قبل و بعد با همان فاصله، نور و پس‌زمینه', en: 'Before and after with the same distance, light and background' },
];
