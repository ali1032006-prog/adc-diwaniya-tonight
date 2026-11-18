// Strings and locale helpers. Arabic is the default and reads right to left.
export type Lang = 'ar' | 'en';
export type Numerals = 'auto' | 'arab' | 'latn';

export type Fmt = (n: number) => string;

// Arabic dual and plural agreement for "N seats open".
function arOpen(open: number, fmt: Fmt): string {
  if (open === 1) return 'مقعد واحد شاغر';
  if (open === 2) return 'مقعدان شاغران';
  return `${fmt(open)} مقاعد شاغرة`;
}

const ar = {
  appName: 'ديوانيتنا',
  tabs: { tonight: 'الليلة', diwaniya: 'الديوانية', score: 'النقاط', league: 'الدوري', me: 'حسابي' },
  navLabel: 'التنقل الرئيسي',
  games: { kout: 'كوت', baloot: 'بلوت', tarneeb: 'طرنيب', trix: 'تركس' },
  seatRing: (game: string, taken: number, total: number, open: number, fmt: Fmt) =>
    `طاولة ${game}: ${fmt(taken)} من ${fmt(total)} مقاعد مشغولة، ${arOpen(open, fmt)}`,
  seatsOpen: (open: number, fmt: Fmt) => (open === 0 ? 'الطاولة مكتملة' : arOpen(open, fmt)),
  tonight: {
    title: 'الليلة',
    emptyTitle: 'لا توجد مقاعد شاغرة قربك الليلة',
    emptyBody: 'تابع الديوانيات التي تحبها، وسنخبرك حين ينقصها لاعب.',
    follow: 'تابع ديوانيات',
    openYours: 'افتح ديوانيتك',
  },
  diwaniya: {
    title: 'الديوانية',
    emptyTitle: 'افتح ليلتك الأولى',
    emptyBody: 'أضف طاولة لكل لعبة، فيرى متابعوك المقاعد الشاغرة لحظة بلحظة.',
    open: 'افتح الليلة',
  },
  league: {
    title: 'الدوري',
    emptyTitle: 'سجّل أول لعبة لتبدأ الموسم',
    emptyBody: 'كل نتيجة تُسجَّل من أي جوال تدخل جدول الديوانية، ولا تضيع إن ضاع الجوال.',
    score: 'النقاط',
  },
  inbox: {
    title: 'الوارد',
    emptyTitle: 'لا شيء بعد',
    emptyBody: 'فعّل التنبيهات لتعرف بالمقاعد الشاغرة في الألعاب والمناطق التي تختارها.',
    enable: 'فعّل التنبيهات',
  },
  me: {
    title: 'حسابي',
    account: 'الحساب',
    guest: 'تتصفح كضيف',
    guestBody: 'التسجيل يفتح لك طلب المقاعد ومتابعة الديوانيات والدوري.',
    preferences: 'التفضيلات',
    language: 'اللغة',
    numerals: 'الأرقام',
    numeralsAuto: 'حسب اللغة',
    theme: 'المظهر',
    themeAuto: 'حسب الجهاز',
    themeNight: 'ليلي',
    themeDay: 'نهاري',
  },
  welcome: {
    panels: [
      { title: 'شوف المقاعد الشاغرة الليلة', body: 'كل طاولة تُظهر من جالس ومن ينقص، لعبة بلعبة.' },
      { title: 'اطلب المقعد، والمضيف يوافق', body: 'العنوان الدقيق لا يظهر إلا لمن وافق عليه المضيف.' },
      { title: 'دوري الديوانية محفوظ للجميع', body: 'النتائج والنجوم والشهر، من أي جوال.' },
    ],
    start: 'يلّا نبدأ',
    next: 'التالي',
    language: 'English',
  },
};

type Strings = typeof ar;

const en: Strings = {
  appName: 'Diwaniyatna',
  tabs: { tonight: 'Tonight', diwaniya: 'Diwaniya', score: 'Score', league: 'League', me: 'Me' },
  navLabel: 'Main navigation',
  games: { kout: 'Kout', baloot: 'Baloot', tarneeb: 'Tarneeb', trix: 'Trix' },
  seatRing: (game, taken, total, open, fmt) =>
    `${game} table: ${fmt(taken)} of ${fmt(total)} seats taken, ${fmt(open)} ${open === 1 ? 'seat' : 'seats'} open`,
  seatsOpen: (open, fmt) => (open === 0 ? 'Table full' : `${fmt(open)} ${open === 1 ? 'seat' : 'seats'} open`),
  tonight: {
    title: 'Tonight',
    emptyTitle: 'No open seats near you tonight',
    emptyBody: "Follow the diwaniyas you like and we'll tell you when a table is one short.",
    follow: 'Follow diwaniyas',
    openYours: 'Open yours',
  },
  diwaniya: {
    title: 'Diwaniya',
    emptyTitle: 'Open your first night',
    emptyBody: 'Add a table for each game and your followers see the open seats as they change.',
    open: 'Open tonight',
  },
  league: {
    title: 'League',
    emptyTitle: 'Score your first game to start the season',
    emptyBody: "Every result scored from any phone lands in the diwaniya's table, and stays if a phone is lost.",
    score: 'Score',
  },
  inbox: {
    title: 'Inbox',
    emptyTitle: 'Nothing yet',
    emptyBody: 'Turn on pings to hear about open seats for the games and areas you choose.',
    enable: 'Turn on pings',
  },
  me: {
    title: 'Me',
    account: 'Account',
    guest: "You're browsing as a guest",
    guestBody: 'An account lets you request seats, follow diwaniyas and keep the league.',
    preferences: 'Preferences',
    language: 'Language',
    numerals: 'Numerals',
    numeralsAuto: 'Follow language',
    theme: 'Theme',
    themeAuto: 'Follow device',
    themeNight: 'Night',
    themeDay: 'Day',
  },
  welcome: {
    panels: [
      { title: 'See the open seats tonight', body: "Every table shows who's sitting and who's missing, game by game." },
      { title: 'Ask for the seat, the host approves', body: 'The exact address shows only to guests the host approved.' },
      { title: "The diwaniya's league, kept for everyone", body: 'Results, stars and the monthly crown, from any phone.' },
    ],
    start: "Let's start",
    next: 'Next',
    language: 'العربية',
  },
};

export const STRINGS: Record<Lang, Strings> = { ar, en };

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** Locale tag for Intl, honouring the numerals override (Arabic-Indic or Western digits). */
export function localeFor(lang: Lang, numerals: Numerals): string {
  const base = lang === 'ar' ? 'ar-KW' : 'en-GB';
  return numerals === 'auto' ? base : `${base}-u-nu-${numerals}`;
}

export function formatNumber(n: number, lang: Lang, numerals: Numerals): string {
  return new Intl.NumberFormat(localeFor(lang, numerals)).format(n);
}
