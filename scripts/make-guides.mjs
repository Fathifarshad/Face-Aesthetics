// Builds the two PDF user guides (physicians, clients) into public/guides/ (served beside the app on GitHub Pages).
// Screenshots: GUIDE_SHOTS=1 npx playwright test e2e/guide-shots.spec.ts (faces blurred). QR codes: docs/guides/qr/.
// Rendering uses the Playwright Chromium (correct Persian shaping, Vazirmatn from node_modules). Run: node scripts/make-guides.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const url = (p) => pathToFileURL(resolve(ROOT, p)).href;
const SHOTS = 'test-results/guide';
const BUILD = 'test-results/guide-build';
const OUT = 'public/guides';
mkdirSync(BUILD, { recursive: true });
mkdirSync(OUT, { recursive: true });

const WEB = 'https://fathifarshad.github.io/Face-Aesthetics/';
const LOGO = readFileSync('public/icon.svg', 'utf8');
const qr = (name) => readFileSync(`docs/guides/qr/${name}.svg`, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/width="[^"]*" height="[^"]*"/, 'width="100%" height="100%"');
const FOUNDERS = 'مؤسسین: دکتر فرشاد فتحی و دکتر نغمه نوری';
const VERSION = 'نسخهٔ 1.0 · آبان 1405';

const font = (f) => url(`node_modules/@fontsource-variable/vazirmatn/files/${f}`);
const CSS = `
@font-face { font-family: Vazirmatn; font-weight: 100 900; src: url(${font('vazirmatn-arabic-wght-normal.woff2')}) format('woff2'); unicode-range: U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFC; }
@font-face { font-family: Vazirmatn; font-weight: 100 900; src: url(${font('vazirmatn-latin-wght-normal.woff2')}) format('woff2'); }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Vazirmatn, sans-serif; color: #1d1b17; font-size: 10.6pt; line-height: 1.85; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; padding: 22mm 17mm 20mm; background: #fbf8f1; }
.page:last-child { page-break-after: auto; }
.top { position: absolute; inset-inline: 17mm; top: 9mm; display: flex; align-items: center; gap: 3mm; padding-bottom: 2.5mm; border-bottom: 0.6mm solid #d4af37; font-size: 8.6pt; color: #6b5a2a; }
.top svg { width: 7mm; height: 7mm; }
.top .sp { flex: 1; }
.foot { position: absolute; inset-inline: 17mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 8.2pt; color: #7a705c; border-top: 0.3mm solid #e2d6b4; padding-top: 2mm; }
h1 { font-size: 19pt; margin: 0 0 1mm; color: #0a0a0b; font-weight: 800; }
h1 small { display: block; font-size: 9pt; color: #a8862a; font-weight: 600; letter-spacing: .3mm; }
h2 { font-size: 12.5pt; margin: 4mm 0 1.5mm; color: #0a0a0b; }
p { margin: 0 0 2.5mm; text-align: justify; }
.intro { color: #3b372e; }
ol, ul { margin: 0 0 2mm; padding-inline-start: 6mm; }
li { margin-bottom: 1mm; }
li b { color: #0a0a0b; }
.shots { display: flex; gap: 9mm; justify-content: center; margin: 3mm 0 3mm; }
figure { margin: 0; width: 55mm; text-align: center; }
figure .phone { width: 55mm; height: 119mm; border-radius: 6mm; overflow: hidden; border: 1.6mm solid #0a0a0b; box-shadow: 0 1.5mm 4mm rgba(0,0,0,.18); background: #0a0a0b; }
figure.one { width: 62mm; } figure.one .phone { width: 62mm; height: 134mm; }
figure img { width: 100%; display: block; }
figcaption { font-size: 8.6pt; color: #6b5a2a; margin-top: 1.5mm; line-height: 1.5; }
.box { border: 0.4mm solid #e2d6b4; background: #fff; border-radius: 3mm; padding: 3mm 4mm; margin: 2.5mm 0; }
.box.gold { border-color: #d4af37; background: #fffaf0; }
.box.warn { border-color: #c9772c; background: #fff5ec; }
.box h3 { margin: 0 0 1mm; font-size: 10.5pt; }
.two { display: flex; gap: 6mm; } .two > * { flex: 1; }
.qrs { display: flex; gap: 6mm; justify-content: center; margin: 2mm 0; }
.qr { width: 52mm; text-align: center; border: 0.4mm solid #e2d6b4; border-radius: 3mm; background: #fff; padding: 3mm; }
.qr .code { width: 34mm; height: 34mm; margin: 0 auto 1mm; }
.qr b { display: block; font-size: 10pt; }
.qr span { display: block; direction: ltr; font-size: 6.6pt; color: #555; word-break: break-all; line-height: 1.4; }
table { width: 100%; border-collapse: collapse; font-size: 9.4pt; margin: 2mm 0; }
th, td { border: 0.3mm solid #e2d6b4; padding: 1.6mm 2.4mm; vertical-align: top; text-align: start; }
th { background: #f3ead2; }
.ltr { direction: ltr; unicode-bidi: isolate; }
/* Cover */
.cover { background: radial-gradient(120mm 120mm at 50% 34%, #2a2210 0%, #0a0a0b 70%); color: #f3ead2; padding: 0; }
.cover .in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 38mm 20mm 20mm; }
.cover .logo { width: 52mm; height: 52mm; filter: drop-shadow(0 0 10mm rgba(212,175,55,.45)); }
.cover .name { font-size: 46pt; font-weight: 800; color: #d4af37; margin-top: 8mm; line-height: 1.2; }
.cover .en { font-size: 13pt; letter-spacing: 2.4mm; color: #a8862a; direction: ltr; }
.cover .clinic { font-size: 15pt; margin-top: 6mm; color: #f3ead2; font-weight: 600; }
.cover .rule { width: 60mm; height: 0.5mm; background: linear-gradient(90deg, transparent, #d4af37, transparent); margin: 9mm 0; }
.cover .title { font-size: 26pt; font-weight: 800; color: #fff; }
.cover .sub { font-size: 11pt; color: #cfc4a6; margin-top: 2mm; max-width: 140mm; }
.cover .founders { margin-top: auto; border: 0.4mm solid #6b5a2a; border-radius: 4mm; padding: 5mm 10mm; }
.cover .founders .k { font-size: 9pt; color: #a8862a; }
.cover .founders .v { font-size: 14pt; font-weight: 700; color: #f3ead2; }
.cover .ver { font-size: 8.5pt; color: #8a7d5c; margin-top: 5mm; }
`;

const shot = (file, caption, one = false) => {
  if (!existsSync(`${SHOTS}/${file}.jpg`)) throw new Error(`missing screenshot ${file} — run GUIDE_SHOTS=1 npx playwright test e2e/guide-shots.spec.ts`);
  return `<figure class="${one ? 'one' : ''}"><div class="phone"><img src="${url(`${SHOTS}/${file}.jpg`)}"></div><figcaption>${caption}</figcaption></figure>`;
};
const shots = (...s) => `<div class="shots">${s.join('')}</div>`;
const list = (items, ordered = true) => `<${ordered ? 'ol' : 'ul'}>${items.map((i) => `<li>${i}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const qrBox = (name, title, link) => `<div class="qr"><div class="code">${qr(name)}</div><b>${title}</b><span>${link}</span></div>`;

function cover(title, sub) {
  return `<section class="page cover"><div class="in">
    <div class="logo">${LOGO}</div>
    <div class="name">نوا</div><div class="en">NEVA</div>
    <div class="clinic">کلینیک زیبایی نوا</div>
    <div class="rule"></div>
    <div class="title">${title}</div><div class="sub">${sub}</div>
    <div class="founders"><div class="k">مؤسسین</div><div class="v">دکتر فرشاد فتحی &nbsp;·&nbsp; دکتر نغمه نوری</div></div>
    <div class="ver">${VERSION}</div>
  </div></section>`;
}

function build(guideName, pages) {
  const total = pages.length + 1;
  const body = pages
    .map(
      (p, i) => `<section class="page">
  <div class="top">${LOGO}<b>کلینیک زیبایی نوا</b><span class="sp"></span><span>${guideName}</span></div>
  <h1><small>${p.kicker ?? ''}</small>${p.title}</h1>
  ${p.body}
  <div class="foot"><span>${FOUNDERS}</span><span>صفحهٔ ${i + 2} از ${total}</span></div>
</section>`,
    )
    .join('\n');
  return body;
}

const installAndroid = (apk) =>
  list([
    'کد QR را با دوربین گوشی اسکن کنید یا لینک را در <b>Chrome</b> باز کنید؛ فایل <span class="ltr">' + apk + '</span> دانلود می‌شود.',
    'فایل دانلودشده را باز کنید. اگر اندروید پرسید، اجازهٔ <b>«نصب برنامه‌های ناشناس»</b> را برای همان برنامه (Chrome یا مدیر فایل) بدهید.',
    'اگر Play Protect هشدار «برنامهٔ ناشناخته» داد، <b>«جزئیات بیشتر ← درهرحال نصب شود»</b> را بزنید (برنامه از فروشگاه نصب نشده است).',
    '<b>«نصب»</b> را بزنید و سپس برنامه را باز کنید. نخستین اجرا به اینترنت نیاز دارد؛ پس از آن بدون اینترنت هم کار می‌کند.',
    'برنامه داخل <b>Google Chrome</b> اجرا می‌شود؛ Chrome باید نصب و به‌روز باشد.',
  ]);

// ---------- Physicians ----------
const doctorPages = [
  {
    kicker: 'آشنایی',
    title: 'نوا چیست؟',
    body: `
<p class="intro">«نوا» دستیار آنالیز زیبایی‌شناسی چهره و برنامه‌ریزی درمان برای پزشکان کلینیک زیبایی نواست. پزشک یک عکس استاندارد از چهره می‌گیرد، سن واقعی و سن هدف را تعیین می‌کند و برنامه سه خروجی می‌دهد:</p>
${list([
  '<b>تصویر شبیه‌سازی</b> بهترین نتیجهٔ متناسب با سن، که هر تغییرش جدا قابل تنظیم است.',
  '<b>فهرست تغییرات</b> هر ناحیه با گزینه‌های درمانی؛ انتخاب هر گزینه بلافاصله روی تصویر اعمال می‌شود.',
  '<b>تخمین حجم، دوز و هزینه</b> برای هر گزینه همراه با کدهای MD Codes، گزارش امضاشده و گالری قبل و بعد با رضایت مراجع.',
])}
<div class="box gold"><h3>اصول ثابت برنامه</h3>${list(
      [
        'همهٔ عکس‌ها و پرونده‌ها <b>فقط روی همان دستگاه</b> و رمزنگاری‌شده ذخیره می‌شوند؛ هیچ عکسی به اینترنت فرستاده نمی‌شود.',
        'هر تصویر شبیه‌سازی برچسب ثابت <b>«شبیه‌سازی؛ نتیجهٔ واقعی متفاوت است»</b> دارد.',
        'برنامه <b>راهنمای تزریق نیست</b>: عمق، زاویه، ابزار و روش تزریق نشان داده نمی‌شود؛ تصمیم نهایی با پزشک است.',
        'هیچ چیز بدون <b>امضای پزشک</b> وارد گزارش یا فایل مراجع نمی‌شود.',
        'تخمین‌ها همیشه بازه و با واحدند. دوزهای برچسب فقط برای OnabotulinumtoxinA است.',
      ],
      false,
    )}</div>
<div class="box"><h3>تأیید بالینی</h3><p style="margin:0">همهٔ مقادیر بالینی برنامه (بازهٔ حجم و دوز، زمان شروع اثر، ماندگاری و نقاهت، آستانه‌های درجه‌بندی، ضرایب سنی، کدهای MD Codes و زمان عکس «بعد») در تاریخ 26 آبان 1405 توسط <b>دکتر فرشاد فتحی و دکتر نغمه نوری</b> بازبینی و تأیید شده است. هر پزشک می‌تواند در صفحهٔ طرح درمان، عدد هر بیمار را با «ویرایش پزشک» تغییر دهد.</p></div>
<h2>مسیر کار در یک نگاه</h2>
<table><tr><th>1</th><td>پروندهٔ جدید، پرسشنامه و رضایت سطح ۱</td><th>5</th><td>طرح درمان، تخمین و هزینه</td></tr>
<tr><th>2</th><td>عکاسی استاندارد طبق راهنما</td><th>6</th><td>رضایت سطح ۳ و گالری قبل و بعد</td></tr>
<tr><th>3</th><td>درجه‌بندی و تأیید یافته‌ها</td><th>7</th><td>گزارش، امضا و چاپ</td></tr>
<tr><th>4</th><td>شبیه‌سازی (ناحیه‌ای یا MD Codes)</td><th>8</th><td>ارسال فایل به اپ مراجع</td></tr></table>`,
  },
  {
    kicker: 'نصب',
    title: 'نصب روی گوشی، تبلت و کامپیوتر',
    body: `
<p class="intro">نوا یک برنامهٔ تحت وب پیشرفته (PWA) است و یک فایل نصبی اندروید هم دارد. نسخهٔ پزشک و نسخهٔ مراجع جدا هستند؛ این راهنما برای نسخهٔ <b>پزشک</b> است.</p>
<div class="qrs">${qrBox('apk-doctor', 'اپ اندروید پزشک (APK)', WEB + 'download/NEVA.apk')}${qrBox('web', 'نسخهٔ وب', WEB)}</div>
<h2>اندروید (فایل APK)</h2>${installAndroid('NEVA.apk')}
<div class="two"><div><h2>آیفون و آیپد</h2>${list([
      'لینک نسخهٔ وب را در <b>Safari</b> باز کنید.',
      'دکمهٔ <b>اشتراک‌گذاری</b> و سپس <b>«افزودن به صفحهٔ اصلی»</b> را بزنید.',
      'از این پس «نوا» مثل یک برنامه از صفحهٔ اصلی باز می‌شود.',
    ])}</div><div><h2>کامپیوتر (Edge یا Chrome)</h2>${list([
      'لینک نسخهٔ وب را باز کنید.',
      'در نوار آدرس روی نماد <b>نصب برنامه</b> بزنید.',
      'برای عکاسی با دوربین گوشی، از گوشی استفاده کنید یا عکس را از فایل انتخاب کنید.',
    ])}</div></div>
<div class="box warn"><h3>مهم: داده‌ها روی همان دستگاه است</h3><p style="margin:0">پرونده‌ها در حافظهٔ مرورگرِ همان دستگاه ذخیره می‌شوند. «پاک کردن داده‌های Chrome/سایت» یا حذف برنامه همراه با پاک کردن داده‌ها، همهٔ پرونده‌ها را برای همیشه پاک می‌کند. برای هر دستگاه رمز و کد بازیابی جدا ساخته می‌شود.</p></div>`,
  },
  {
    kicker: 'گام اول',
    title: 'ورود و امنیت پنل پزشک',
    body: `
<p class="intro">صفحهٔ اول، نام کلینیک و مؤسسین و دو ورودی «پنل پزشک» و «اپ مراجع» را نشان می‌دهد. نخستین بار که پنل پزشک را باز می‌کنید، یک رمز می‌سازید؛ عکس‌های بیماران با این رمز روی دستگاه رمزنگاری می‌شوند.</p>
${shots(shot('home', 'صفحهٔ اول برنامه'), shot('vault', 'ساخت رمز پنل پزشک'))}
${list([
  'رمزی با دست‌کم <b>8 نویسه</b> بسازید و دوباره وارد کنید، سپس «ساخت رمز و ادامه» را بزنید.',
  '<b>کد بازیابی</b> فقط یک بار نشان داده می‌شود؛ آن را روی کاغذ یادداشت و در جای امن نگه دارید. بدون رمز و بدون این کد، عکس‌ها برای همیشه از دست می‌روند.',
  'با بستن برنامه یا تازه‌سازی صفحه، پنل قفل می‌شود و دوباره رمز می‌خواهد. دکمهٔ <b>«قفل کن»</b> پنل را بی‌درنگ قفل می‌کند.',
  'اگر رمز را فراموش کردید: «رمز را فراموش کرده‌ام» ← کد بازیابی ← رمز تازه. کد قدیمی پس از بازیابی باطل می‌شود و کد تازه داده می‌شود.',
])}`,
  },
  {
    kicker: 'تنظیمات',
    title: 'پنل مدیریت: پزشک، کلینیک و تعرفه',
    body: `
<p class="intro">پیش از نخستین گزارش، از منوی پنل پزشک وارد <b>پنل مدیریت</b> شوید. بخش‌ها: امنیت، پزشک و کلینیک، تعرفه و ایمنی، مراقبت پس از درمان، داده‌ها و ابزارها.</p>
${shots(shot('admin-clinic', 'پزشک و کلینیک'), shot('admin-pricing', 'تعرفه و ایمنی'))}
${list([
  '<b>پزشک و کلینیک:</b> نام پزشک و شمارهٔ نظام پزشکی برای امضای گزارش لازم است؛ نام و رنگ کلینیک در سربرگ گزارش می‌آید.',
  '<b>تعرفه و ایمنی:</b> واحد پول، قیمت هر میلی‌لیتر فیلر (ساختاری، نرم، لب)، قیمت هر واحد توکسین، نخ و جلسهٔ هر دستگاه؛ حجم هر سرنگ (پیش‌فرض 1 mL) و واحد هر ویال (پیش‌فرض 100 U). بدون تعرفه، مرتب‌سازی هزینه با ردهٔ نسبی انجام می‌شود.',
  '<b>مراقبت پس از درمان:</b> متن توصیه‌هایی که در اپ مراجع نشان داده می‌شود.',
  '<b>داده‌ها:</b> فضای مصرفی و شمار پرونده‌ها؛ کلید «رندر واقع‌گرایانهٔ ابری» (پیش‌فرض خاموش؛ در این نسخه فقط نمونهٔ آزمایشی و بدون ارسال عکس). حذف کامل یک بیمار از صفحهٔ همان بیمار انجام می‌شود.',
  '<b>امنیت:</b> تغییر رمز پنل.',
])}`,
  },
  {
    kicker: 'گام ۱',
    title: 'پروندهٔ جدید، پرسشنامه و رضایت سطح ۱',
    body: `
<p class="intro">از «پرونده‌ها» دکمهٔ پروندهٔ جدید را بزنید. خدمت انتخاب‌شده تعیین می‌کند کدام عکس‌ها لازم است.</p>
${shots(shot('new-case', 'پروندهٔ جدید'), shot('intake', 'پرسشنامه و رضایت'))}
${list([
  'نام نمایشی، شمارهٔ پرونده، <b>سال تولد میلادی</b> و جنس را وارد کنید و خدمت را برگزینید (پیش‌فرض: آنالیز کامل چهره)، سپس «ایجاد و ادامه».',
  'پرسشنامه را کامل کنید: بارداری، عفونت فعال و حساسیت، گزینه‌های مرتبط را <b>مسدود</b> می‌کنند؛ سایر موارد هشدار می‌دهند.',
  '<b>رضایت سطح ۱</b> (آنالیز و نگه‌داری عکس) را با نام و امضای لمسی مراجع ثبت کنید؛ بدون آن عکاسی ممکن نیست.',
  'اگر مراجع اپ نوا را دارد، کلید <b>«ارسال پرونده به اپ مراجع»</b> را روشن کنید.',
])}`,
  },
  {
    kicker: 'گام ۲ و ۳',
    title: 'عکاسی استاندارد و درجه‌بندی',
    body: `
<p class="intro">هر خدمت فهرست عکس‌های لازم را دارد (روبه‌رو، نیم‌رخ‌ها، حالت‌های حرکتی و…). کنار هر عکس راهنمای ژست آمده است.</p>
${shots(shot('capture', 'عکس‌های لازم برای خدمت'), shot('grading', 'درجه‌بندی یافته‌ها'))}
${list([
  'نور یکنواخت از روبه‌رو، چهرهٔ بی‌حالت، موها عقب، بدون عینک و آرایش سنگین؛ قاب صورت را با خطوط راهنما هم‌تراز کنید.',
  'با دوربین زنده عکس بگیرید یا عکس را از فایل انتخاب کنید. پنجرهٔ «تأیید عکس» کیفیت را می‌سنجد؛ «تأیید و ذخیره» را بزنید.',
  'برای عکس «بعد»، تصویر کم‌رنگ عکس «قبل» روی دوربین می‌آید؛ اگر خط چشم‌ها جابه‌جا باشد هشدار داده می‌شود.',
  '<b>درجه‌بندی:</b> برنامه برای هر ناحیه درجهٔ 0 تا 4 پیشنهاد می‌دهد (با میزان اطمینان). پزشک هر درجه را تأیید یا اصلاح می‌کند؛ درجه‌های تأییدشده پایهٔ شبیه‌سازی و تخمین‌ها هستند.',
])}
<div class="box"><p style="margin:0">درجهٔ خودکار به نور، لبخند، مو و لباس حساس است؛ همیشه با چشم خود بازبینی کنید.</p></div>`,
  },
  {
    kicker: 'گام ۴',
    title: 'شبیه‌سازی: سن هدف و تغییرات',
    body: `
<p class="intro">صفحهٔ شبیه‌سازی تصویر «قبل» و «بعد» را با یک اسلایدر مقایسه نشان می‌دهد. هر تغییر پیش‌فرض دست‌کم یک درجه بهبود می‌دهد.</p>
${shots(shot('simulate', 'سن هدف و مقایسهٔ قبل و بعد'), shot('simulate-options', 'تغییرات و گزینه‌های درمان'))}
${list([
  '<b>سن هدف:</b> «بهترین حالت همین سن»، «حدود 5 سال جوان‌تر»، «حدود 10 سال جوان‌تر» یا «سن دلخواه». «بازگشت به پیش‌فرض» تنظیمات دستی را برمی‌گرداند.',
  'اسلایدر وسط تصویر را بکشید تا قبل و بعد را مقایسه کنید. با لمس یک ناحیه روی عکس، تغییر همان ناحیه انتخاب می‌شود.',
  'هر تغییر کلید روشن/خاموش، اسلایدر شدت و در نواحی دوطرفه کلید <b>قرینه</b> دارد. «همه خاموش» همهٔ تغییرات را خاموش می‌کند.',
  'زیر هر تغییر، <b>گزینه‌های درمانی</b> آمده است؛ انتخاب هر گزینه نوع اثر (صاف‌کردن، حجم‌دهی یا هر دو) و سقف اثر را روی تصویر تعیین می‌کند.',
  '«ذخیرهٔ تصویر شبیه‌سازی» تصویر را با برچسب ثابت برای گزارش و اپ مراجع ذخیره می‌کند.',
])}`,
  },
  {
    kicker: 'گام ۴',
    title: 'حالت حجم‌دهی فیلر بر اساس MD Codes',
    body: `
<p class="intro">در بالای فهرست تغییرات دو حالت هست: <b>«حجم‌دهی بر اساس ناحیه»</b> و <b>«حجم‌دهی فیلر بر اساس MD Codes»</b>. در هر لحظه فقط یکی روشن است تا هیچ ناحیه‌ای دو بار حجم نگیرد. صاف‌کردن چین و پوست در هر دو حالت می‌ماند.</p>
${shots(shot('simulate-mdcodes', 'حالت MD Codes در شبیه‌سازی'), shot('mdcodes', 'صفحهٔ کدهای گزینه‌های فیلر'))}
${list([
  '51 کد استاندارد در 13 خانواده (Ck، T، C، Jw، Lp، NL، M، Tt، E، F، G، O، N). هر خانواده یک اسلایدر دارد و با «+» به کدهایش باز می‌شود؛ هر کد کلید و اسلایدر جدا دارد.',
  'کنار هر کد بازهٔ تقریبی حجم به میلی‌لیتر می‌آید. وقتی دو کد مجاور پر شوند، فاصلهٔ بینشان یکپارچه و نرم پر می‌شود.',
  '<b>کدهای هشدار</b> (G، N، Tt، T، NL1) به رنگ خطر و با «کانولا توصیه می‌شود» نشان داده می‌شوند. کدهای بینی (N) با یک کلید خاموش می‌شوند.',
  'روی عکس فقط ناحیهٔ تقریبی و نام کد است؛ نقطه، عمق یا ابزار نشان داده نمی‌شود.',
])}
<div class="box"><p style="margin:0">MD Codes™ نشان تجاری است. جانمایی تقریبی است و راهنمای تزریق نیست. منبع: de Maio, Aesthetic Plast Surg 2020, PMC8012343 (CC BY 4.0).</p></div>`,
  },
  {
    kicker: 'گام ۵',
    title: 'طرح درمان، تخمین حجم و دوز، هزینه',
    body: `
<p class="intro">صفحهٔ طرح درمان برای هر ناحیهٔ تأییدشده گزینه‌های درمانی را با تخمین و هزینه نشان می‌دهد. گزینه‌ای که اینجا انتخاب شود، همان است که در شبیه‌سازی اعمال می‌شود.</p>
${shots(shot('plan', 'طرح درمان و مرتب‌سازی'), shot('plan-lips', 'تخمین و هزینهٔ هر گزینه'))}
${list([
  '<b>مرتب‌سازی:</b> نتیجهٔ زیبایی، هزینهٔ کمتر، سرعت اثر، ماندگاری، نقاهت کمتر. از درجهٔ 2 افت حجم میانهٔ صورت، «اول حمایت گونه، بعد چین» پیشنهاد می‌شود.',
  'تخمین = پایهٔ درجهٔ 3 × ضریب درجه × شدت تغییر در شبیه‌سازی؛ گرد شده به 0.1 mL و 2 U. دوزهای برچسب بدون تغییر نمایش داده می‌شوند.',
  'برای توکسین ابتدا <b>برند</b> را انتخاب کنید؛ عدد خودکار فقط برای OnabotulinumtoxinA داده می‌شود.',
  'هر عدد را می‌توانید با <b>«ویرایش پزشک»</b> عوض کنید (در سابقه ثبت می‌شود). جمع کل: میلی‌لیتر و تعداد سرنگ، واحد و تعداد ویال، نخ، جلسه‌ها و هزینه.',
  'برچسب‌های خطر: ناحیهٔ پرخطر عروقی برای تزریقی‌ها، و احتیاط در Fitzpatrick بالا برای دستگاه‌ها.',
])}`,
  },
  {
    kicker: 'گام ۶',
    title: 'رضایت‌نامه‌ها و گالری قبل و بعد',
    body: `
<p class="intro">رضایت برای هر مراجع ثبت می‌شود و هر خروجی که عکس دارد (فایل مراجع، گزارش، فایل گالری) پیش از ساخته شدن، رضایت را بررسی می‌کند.</p>
<div class="two"><div style="flex:0 0 62mm">${shot('gallery', 'گالری و رضایت سطح ۳', true)}</div><div>
<table><tr><th>سطح</th><th>اجازه</th></tr>
<tr><td>۱</td><td>آنالیز و نگه‌داری عکس روی دستگاه؛ لازمِ عکاسی.</td></tr>
<tr><td>۲</td><td>ارسال عکس به رندر ابری (در این نسخه فعال نیست).</td></tr>
<tr><td>۳</td><td>استفاده از عکس‌های قبل و بعد: فقط داخلی، آموزشی یا انتشار عمومی؛ با گزینهٔ پوشاندن چشم‌ها.</td></tr></table>
${list([
  'بدون سطح ۳ هیچ عکسی در فایل مراجع، گزارش یا فایل گالری نمی‌آید («فقط داخلی» نسخهٔ خود مراجع را هم پوشش می‌دهد).',
  'رضایت قابل <b>پس گرفتن</b> است؛ از همان لحظه هیچ خروجی تازه‌ای عکس ندارد (نسخه‌های قبلی پس گرفته نمی‌شوند).',
  'گالری جفت عکس‌های قبل و بعد هر زاویه را نشان می‌دهد و زمان مناسب عکس «بعد» را برای هر درمان یادآوری می‌کند.',
  '<b>مقایسه:</b> اسلایدر، کنار هم، و «شبیه‌سازی در برابر نتیجهٔ واقعی».',
])}</div></div>`,
  },
  {
    kicker: 'گام ۷',
    title: 'گزارش، امضای پزشک و چاپ',
    body: `
<p class="intro">گزارش شامل سربرگ کلینیک، عکس‌ها (با رضایت سطح ۳)، تصویر شبیه‌سازی با برچسب، جدول اقلام درمان با تخمین و هزینه، توضیح پزشک و ترتیب جلسات است.</p>
${shots(shot('report-signed', 'تأیید و امضای گزارش'), shot('print', 'نسخهٔ چاپی گزارش'))}
${list([
  'در صفحهٔ گزارش «توضیح پزشک» را بنویسید، چهار مورد بازبینی را تأیید کنید، امضا کنید و «امضا و تأیید» را بزنید.',
  'هر تغییری پس از امضا (درجه، شبیه‌سازی، گزینه یا تعرفه) گزارش را <b>منقضی</b> می‌کند؛ چاپ و ارسال تا امضای دوباره بسته می‌ماند.',
  'برای چاپ یا PDF، دکمهٔ چاپ را بزنید و در پنجرهٔ چاپ <b>«ذخیره به‌صورت PDF»</b> را برگزینید. گزارش به فارسی و انگلیسی موجود است.',
])}`,
  },
  {
    kicker: 'گام ۸',
    title: 'ارسال پرونده به اپ مراجع و پاسخ‌ها',
    body: `
<p class="intro">تبادل با مراجع با <b>فایل</b> انجام می‌شود؛ هیچ سروری در کار نیست. فایل را از هر پیام‌رسانی برای مراجع بفرستید.</p>
${shots(shot('patient', 'صفحهٔ بیمار و ارسال فایل'), shot('patients', 'پرونده‌ها و دریافت پاسخ'))}
${list([
  'در صفحهٔ بیمار، «ارسال پرونده به اپ مراجع» فایل <span class="ltr">neva-&lt;کد&gt;.json</span> را می‌سازد و پنجرهٔ اشتراک گوشی را باز می‌کند.',
  'فایل فقط پس از امضای تازهٔ پزشک ساخته می‌شود و شامل نواحی به زبان ساده، درمان انتخاب‌شده، جلسه‌ها، مراقبت، توضیح پزشک و (با رضایت) عکس‌ها و شبیه‌سازی است.',
  'درجه، حجم و دوز، کدهای MD Codes، غربالگری و هزینه هرگز در فایل مراجع نمی‌آیند.',
  'پاسخ پزشک به سؤال‌ها را در «پاسخ پزشک» بنویسید و «افزودن به بستهٔ بعدی» را بزنید.',
  'فایل پاسخ مراجع (<span class="ltr">neva-reply-…json</span>) را در صفحهٔ «پرونده‌ها» وارد کنید؛ سؤال‌ها و عکس‌های پیشرفت به پرونده اضافه می‌شوند.',
])}`,
  },
  {
    kicker: 'پیوست',
    title: 'ایمنی، حریم خصوصی و رفع اشکال',
    body: `
<h2>حریم خصوصی</h2>${list(
      [
        'عکس‌ها، امضاها و تصاویر شبیه‌سازی روی دستگاه رمزنگاری می‌شوند؛ برنامه هیچ ردیاب، آمارگیر یا ارسال خودکاری ندارد.',
        'هر دستگاه پروندهٔ جدای خود را دارد؛ برای جابه‌جایی پرونده به اپ مراجع از فایل استفاده کنید.',
        'گوشی کلینیک را با قفل صفحه محافظت کنید و کد بازیابی را جدا از گوشی نگه دارید.',
      ],
      false,
    )}
<h2>ایمنی بالینی</h2>${list(
      [
        'شبیه‌سازی تقریبی است و پیش‌بینی قطعی نتیجه نیست؛ این را به مراجع هم بگویید.',
        'تخمین‌ها بازهٔ کمکی برای برنامه‌ریزی‌اند؛ مقدار نهایی هر تزریق را پزشک بر بالین تعیین می‌کند.',
        'در نواحی پرخطر عروقی (گلابلا، بینی، ناودان اشکی، شقیقه، بالای چین نازولبیال) احتیاط ویژه لازم است.',
      ],
      false,
    )}
<h2>رفع اشکال</h2>
<table><tr><th>مشکل</th><th>راه‌حل</th></tr>
<tr><td>دوربین سیاه است</td><td>برنامه دوربین‌های مجازی خاموش را رد می‌کند؛ اگر باز هم سیاه بود، دوربین دیگری را برگزینید یا عکس را از فایل انتخاب کنید.</td></tr>
<tr><td>چهره پیدا نشد</td><td>عکس روبه‌رو با نور یکنواخت و چهرهٔ کامل در قاب بگیرید.</td></tr>
<tr><td>گزارش چاپ نمی‌شود</td><td>گزارش باید پس از آخرین تغییر دوباره امضا شود.</td></tr>
<tr><td>اپ آدرس سایت را بالای صفحه نشان می‌دهد</td><td>عادی است و در کار برنامه اثری ندارد.</td></tr>
<tr><td>به‌روزرسانی</td><td>نسخهٔ وب خودکار به‌روز می‌شود؛ برنامه را یک بار با اینترنت باز کنید.</td></tr></table>
<div class="box gold"><p style="margin:0"><b>کلینیک زیبایی نوا</b> — ${FOUNDERS}. نسخهٔ وب: <span class="ltr">${WEB}</span></p></div>`,
  },
];

// ---------- Clients ----------
const clientPages = [
  {
    kicker: 'خوش آمدید',
    title: 'اپ مراجعان نوا',
    body: `
<p class="intro">با اپ مراجعان «نوا» طرح درمانی را که پزشک برایتان تأیید کرده، تصویر شبیه‌سازی، عکس‌های قبل و بعد و توصیه‌های مراقبتی را روی گوشی خودتان می‌بینید و می‌توانید از پزشک سؤال بپرسید.</p>
<div class="box gold"><h3>اطلاعات شما فقط روی گوشی خودتان است</h3><p style="margin:0">اپ به هیچ سروری وصل نیست. کلینیک پروندهٔ شما را به‌صورت یک فایل برایتان می‌فرستد و شما سؤال‌هایتان را با یک فایل به کلینیک برمی‌گردانید.</p></div>
<h2>نصب</h2>
<div class="qrs">${qrBox('apk-client', 'اپ اندروید مراجع (APK)', WEB + 'download/NEVA-Client.apk')}${qrBox('web-client', 'نسخهٔ وب مراجع', WEB + '#/client')}</div>
<h2>اندروید</h2>${installAndroid('NEVA-Client.apk')}
<h2>آیفون</h2>${list(['لینک نسخهٔ وب مراجع را در <b>Safari</b> باز کنید.', '<b>اشتراک‌گذاری ← افزودن به صفحهٔ اصلی</b> را بزنید.'])}`,
  },
  {
    kicker: 'گام ۱',
    title: 'دریافت پروندهٔ کلینیک',
    body: `
<p class="intro">پس از ویزیت و تأیید پزشک، کلینیک یک فایل با نامی شبیه <span class="ltr">neva-TN-….json</span> از طریق پیام‌رسان برای شما می‌فرستد.</p>
${shots(shot('client-home', 'صفحهٔ اول اپ مراجع'), shot('client-plan', 'طرح من'))}
${list([
  'فایل را از پیام‌رسان روی گوشی <b>ذخیره</b> کنید.',
  'اپ «نوا — مراجع» را باز کنید و <b>«وارد کردن فایل کلینیک»</b> را بزنید، سپس همان فایل را انتخاب کنید.',
  'پرونده باز می‌شود. دفعهٔ بعد آن را از «پرونده‌های من» یا با کد بیمار باز کنید.',
  'در بخش <b>«طرح من»</b> نواحی مورد توجه به زبان ساده، درمان انتخاب‌شده برای هر ناحیه، ترتیب جلسات و «توضیح پزشک» را می‌بینید.',
  'هر بار کلینیک فایل تازه‌تری بفرستد، آن را دوباره وارد کنید تا پرونده به‌روز شود. فایل قدیمی‌تر پذیرفته نمی‌شود.',
])}`,
  },
  {
    kicker: 'گام ۲',
    title: 'عکس‌ها و شبیه‌سازی',
    body: `
<div class="two"><div style="flex:0 0 62mm">${shot('client-photos', 'عکس‌ها و شبیه‌سازی تقریبی (چهره برای این راهنما محو شده است)', true)}</div><div>
<p class="intro">در بخش <b>«عکس‌ها»</b> تصویر شبیه‌سازی و عکس‌های قبل و بعد را با یک اسلایدر مقایسه می‌کنید.</p>
${list([
  'اسلایدر را به چپ و راست بکشید تا «قبل» و «شبیه‌سازی» را مقایسه کنید.',
  '<b>شبیه‌سازی تقریبی است</b> و پیش‌بینی قطعی نتیجهٔ درمان نیست؛ نتیجهٔ واقعی شما متفاوت خواهد بود. برچسب این موضوع روی خود تصویر هم آمده است.',
  'عکس‌ها فقط با <b>رضایت امضاشدهٔ شما</b> در فایل کلینیک می‌آیند. اگر رضایت را پس بگیرید، فایل بعدی کلینیک عکس‌ها را از گوشی شما برمی‌دارد.',
  '<b>عکس پیشرفت (بعد از درمان):</b> با همان راهنما و همان نور عکس بگیرید تا پزشک بتواند مقایسه کند. این عکس‌ها مال خودتان است و روی گوشی می‌ماند.',
])}</div></div>`,
  },
  {
    kicker: 'گام ۳',
    title: 'مراقبت پس از درمان و سؤال از پزشک',
    body: `
<p class="intro">توصیه‌های مراقبتی کلینیک برای هر جلسه در بخش <b>«مراقبت»</b> آمده است. برای پرسیدن سؤال از بخش <b>«سؤال از پزشک»</b> استفاده کنید.</p>
${shots(shot('client-care', 'مراقبت پس از درمان'), shot('client-chat', 'سؤال از پزشک'))}
${list([
  'سؤال خود را بنویسید و <b>«ثبت سؤال»</b> را بزنید. می‌توانید چند سؤال و عکس پیشرفت را با هم بفرستید.',
  '<b>«ارسال سؤال‌ها و عکس‌ها به کلینیک»</b> یک فایل می‌سازد؛ آن را با پیام‌رسان برای کلینیک بفرستید.',
  'پاسخ پزشک در فایل بعدی کلینیک می‌آید؛ آن را وارد کنید تا پاسخ را ببینید.',
])}
<div class="box warn"><h3>هشدار فوری</h3><p style="margin:0">در صورت درد شدید، تغییر رنگ پوست (سفیدی یا کبودی) یا اختلال دید پس از تزریق، منتظر پاسخ در اپ نمانید؛ <b>فوراً با کلینیک یا اورژانس تماس بگیرید.</b></p></div>`,
  },
  {
    kicker: 'پرسش‌های رایج',
    title: 'حریم خصوصی و پرسش‌های رایج',
    body: `
<table><tr><th>پرسش</th><th>پاسخ</th></tr>
<tr><td>اطلاعات من کجا ذخیره می‌شود؟</td><td>فقط روی گوشی خودتان. اپ به اینترنت چیزی نمی‌فرستد؛ تبادل با کلینیک فقط با فایلی است که خودتان می‌فرستید.</td></tr>
<tr><td>آیا اپ به اینترنت نیاز دارد؟</td><td>فقط برای نخستین اجرا و نصب. پس از آن بدون اینترنت هم کار می‌کند.</td></tr>
<tr><td>چرا درجه، دوز یا هزینه را نمی‌بینم؟</td><td>این جزئیات تخصصی در پروندهٔ پزشک می‌ماند. برای هر پرسش دربارهٔ هزینه یا مقدار درمان با کلینیک صحبت کنید.</td></tr>
<tr><td>فایل وارد نمی‌شود.</td><td>مطمئن شوید فایل کلینیک (json) است و آخرین نسخه را دارید. اگر پیام «فایل ناقص» دیدید، از کلینیک بخواهید دوباره بفرستد.</td></tr>
<tr><td>گوشی‌ام را عوض کرده‌ام.</td><td>اپ را روی گوشی تازه نصب کنید و آخرین فایل کلینیک را دوباره وارد کنید.</td></tr>
<tr><td>اگر داده‌های Chrome را پاک کنم؟</td><td>پرونده و عکس‌های پیشرفت از گوشی پاک می‌شوند؛ با فایل کلینیک می‌توانید پرونده را دوباره وارد کنید.</td></tr>
<tr><td>آیا شبیه‌سازی همان نتیجهٔ درمان است؟</td><td>نه. شبیه‌سازی تصویری تقریبی برای گفت‌وگو با پزشک است و نتیجهٔ واقعی متفاوت خواهد بود.</td></tr></table>
<div class="box gold"><p style="margin:0"><b>کلینیک زیبایی نوا</b><br>${FOUNDERS}<br>برای هر پرسش دربارهٔ درمان، با کلینیک تماس بگیرید.</p></div>`,
  },
];

const GUIDES = [
  { file: 'NEVA-Guide-Doctors.pdf', name: 'راهنمای پزشکان', sub: 'آنالیز، شبیه‌سازی، طرح درمان، MD Codes، گزارش و اپ مراجع', pages: doctorPages },
  { file: 'NEVA-Guide-Clients.pdf', name: 'راهنمای مراجعان', sub: 'نصب اپ، دریافت پرونده، عکس‌ها و شبیه‌سازی، مراقبت و سؤال از پزشک', pages: clientPages },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const g of GUIDES) {
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>NEVA — ${g.name}</title><style>${CSS}</style></head><body>${cover(g.name, g.sub)}${build(g.name, g.pages)}</body></html>`;
  const htmlPath = `${BUILD}/${g.file.replace('.pdf', '.html')}`;
  writeFileSync(htmlPath, html);
  await page.goto(url(htmlPath));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.pdf({ path: `${OUT}/${g.file}`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  // Overflow check: no page may spill over its A4 box.
  const over = await page.evaluate(() =>
    [...document.querySelectorAll('.page')].map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean),
  );
  console.log(`${OUT}/${g.file}`, over.length ? `OVERFLOW on pages ${over}` : 'ok');
}
await browser.close();
