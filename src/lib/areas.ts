// Kuwait's six governorates and their residential areas. The stored value is the Arabic name;
// the same list is seeded into public.kuwait_areas (migration 20261118_ali_changes), and
// areas.test.ts keeps the two in step.
export interface Governorate { key: string; ar: string; en: string; areas: { ar: string; en: string }[] }
export const GOVERNORATES: Governorate[] = [
  { key: 'capital', ar: 'العاصمة', en: 'Capital', areas: [
    { ar: 'مدينة الكويت', en: 'Kuwait City' },
    { ar: 'شرق', en: 'Sharq' },
    { ar: 'المرقاب', en: 'Mirqab' },
    { ar: 'القبلة', en: 'Qibla' },
    { ar: 'دسمان', en: 'Dasman' },
    { ar: 'بنيد القار', en: 'Bneid Al-Gar' },
    { ar: 'الدسمة', en: 'Dasma' },
    { ar: 'الدعية', en: 'Daiya' },
    { ar: 'الشامية', en: 'Shamiya' },
    { ar: 'الشويخ', en: 'Shuwaikh' },
    { ar: 'ضاحية عبدالله السالم', en: 'Abdullah Al-Salem' },
    { ar: 'المنصورية', en: 'Mansouriya' },
    { ar: 'النزهة', en: 'Nuzha' },
    { ar: 'الفيحاء', en: 'Faiha' },
    { ar: 'كيفان', en: 'Kaifan' },
    { ar: 'العديلية', en: 'Adailiya' },
    { ar: 'الخالدية', en: 'Khaldiya' },
    { ar: 'القادسية', en: 'Qadsiya' },
    { ar: 'الروضة', en: 'Rawda' },
    { ar: 'السرة', en: 'Surra' },
    { ar: 'اليرموك', en: 'Yarmouk' },
    { ar: 'قرطبة', en: 'Qurtuba' },
    { ar: 'غرناطة', en: 'Granada' },
    { ar: 'الصليبيخات', en: 'Sulaibikhat' },
    { ar: 'الدوحة', en: 'Doha' },
    { ar: 'النهضة', en: 'Nahda' },
    { ar: 'القيروان', en: 'Qairawan' },
  ] },
  { key: 'hawalli', ar: 'حولي', en: 'Hawalli', areas: [
    { ar: 'حولي', en: 'Hawalli' },
    { ar: 'السالمية', en: 'Salmiya' },
    { ar: 'الرميثية', en: 'Rumaithiya' },
    { ar: 'الجابرية', en: 'Jabriya' },
    { ar: 'مشرف', en: 'Mishref' },
    { ar: 'بيان', en: 'Bayan' },
    { ar: 'سلوى', en: 'Salwa' },
    { ar: 'الشعب', en: 'Shaab' },
    { ar: 'الشهداء', en: 'Shuhada' },
    { ar: 'حطين', en: 'Hittin' },
    { ar: 'السلام', en: 'Salam' },
    { ar: 'الصديق', en: 'Siddiq' },
    { ar: 'الزهراء', en: 'Zahra' },
    { ar: 'مبارك العبدالله', en: 'Mubarak Al-Abdullah' },
    { ar: 'ميدان حولي', en: 'Maidan Hawalli' },
    { ar: 'البدع', en: 'Bidaa' },
  ] },
  { key: 'farwaniya', ar: 'الفروانية', en: 'Farwaniya', areas: [
    { ar: 'الفروانية', en: 'Farwaniya' },
    { ar: 'خيطان', en: 'Khaitan' },
    { ar: 'جليب الشيوخ', en: 'Jleeb Al-Shuyoukh' },
    { ar: 'العارضية', en: 'Ardiya' },
    { ar: 'الأندلس', en: 'Andalus' },
    { ar: 'الرابية', en: 'Rabiya' },
    { ar: 'الرحاب', en: 'Rehab' },
    { ar: 'العمرية', en: 'Omariya' },
    { ar: 'الري', en: 'Rai' },
    { ar: 'إشبيلية', en: 'Ishbiliya' },
    { ar: 'الفردوس', en: 'Firdous' },
    { ar: 'عبدالله المبارك', en: 'Abdullah Al-Mubarak' },
    { ar: 'أبرق خيطان', en: 'Abraq Khaitan' },
    { ar: 'صباح الناصر', en: 'Sabah Al-Nasser' },
    { ar: 'الضجيج', en: 'Dhajeej' },
  ] },
  { key: 'mubarak', ar: 'مبارك الكبير', en: 'Mubarak Al-Kabeer', areas: [
    { ar: 'مبارك الكبير', en: 'Mubarak Al-Kabeer' },
    { ar: 'القرين', en: 'Qurain' },
    { ar: 'القصور', en: 'Qusour' },
    { ar: 'العدان', en: 'Adan' },
    { ar: 'صباح السالم', en: 'Sabah Al-Salem' },
    { ar: 'المسيلة', en: 'Messila' },
    { ar: 'أبو فطيرة', en: 'Abu Fteira' },
    { ar: 'الفنيطيس', en: 'Funaitees' },
    { ar: 'أبو الحصانية', en: 'Abu Al-Hasaniya' },
    { ar: 'المسايل', en: 'Masayel' },
  ] },
  { key: 'ahmadi', ar: 'الأحمدي', en: 'Ahmadi', areas: [
    { ar: 'الأحمدي', en: 'Ahmadi' },
    { ar: 'الفحيحيل', en: 'Fahaheel' },
    { ar: 'الفنطاس', en: 'Fintas' },
    { ar: 'المنقف', en: 'Mangaf' },
    { ar: 'أبو حليفة', en: 'Abu Halifa' },
    { ar: 'المهبولة', en: 'Mahboula' },
    { ar: 'العقيلة', en: 'Egaila' },
    { ar: 'الرقة', en: 'Riqqa' },
    { ar: 'هدية', en: 'Hadiya' },
    { ar: 'الصباحية', en: 'Sabahiya' },
    { ar: 'فهد الأحمد', en: 'Fahad Al-Ahmad' },
    { ar: 'جابر العلي', en: 'Jaber Al-Ali' },
    { ar: 'الظهر', en: 'Dhaher' },
    { ar: 'الوفرة', en: 'Wafra' },
    { ar: 'الخيران', en: 'Khairan' },
    { ar: 'الزور', en: 'Zour' },
    { ar: 'صباح الأحمد', en: 'Sabah Al-Ahmad' },
    { ar: 'علي صباح السالم', en: 'Ali Sabah Al-Salem' },
    { ar: 'الجليعة', en: 'Julaia' },
    { ar: 'بنيدر', en: 'Bnaider' },
  ] },
  { key: 'jahra', ar: 'الجهراء', en: 'Jahra', areas: [
    { ar: 'الجهراء', en: 'Jahra' },
    { ar: 'القصر', en: 'Qasr' },
    { ar: 'النعيم', en: 'Naeem' },
    { ar: 'العيون', en: 'Oyoun' },
    { ar: 'الواحة', en: 'Waha' },
    { ar: 'تيماء', en: 'Taima' },
    { ar: 'النسيم', en: 'Naseem' },
    { ar: 'سعد العبدالله', en: 'Saad Al-Abdullah' },
    { ar: 'مدينة جابر الأحمد', en: 'Jaber Al-Ahmad City' },
    { ar: 'الصليبية', en: 'Sulaibiya' },
    { ar: 'أمغرة', en: 'Amghara' },
    { ar: 'كبد', en: 'Kabd' },
    { ar: 'العبدلي', en: 'Abdali' },
    { ar: 'المطلاع', en: 'Mutlaa' },
    { ar: 'الصبية', en: 'Subiya' },
  ] },
];

const BY_AR = new Map<string, { gov: Governorate; en: string }>();
for (const g of GOVERNORATES) for (const a of g.areas) BY_AR.set(a.ar, { gov: g, en: a.en });
const BY_EN = new Map<string, string>();
for (const g of GOVERNORATES) for (const a of g.areas) BY_EN.set(a.en.toLowerCase(), a.ar);

/** The stored value for an area name typed or saved either way ('Salmiya' or 'السالمية'), or '' if unknown. */
export function areaValue(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (BY_AR.has(n)) return n;
  return BY_EN.get(n.toLowerCase()) ?? '';
}

/** An area as the reader's language names it; values outside the list show as stored. */
export function areaLabel(value: string | null | undefined, lang: 'ar' | 'en'): string {
  const v = (value ?? '').trim();
  const hit = BY_AR.get(areaValue(v));
  if (!hit) return v;
  return lang === 'en' ? hit.en : areaValue(v);
}

/** The governorate key of a stored area, or null. */
export function governorateOf(value: string | null | undefined): string | null {
  return BY_AR.get(areaValue(value))?.gov.key ?? null;
}

export function governorateLabel(key: string | null, lang: 'ar' | 'en'): string {
  const g = GOVERNORATES.find((x) => x.key === key);
  return g ? (lang === 'en' ? g.en : g.ar) : '';
}
