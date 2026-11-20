const groups = {
  cis: 'AM AZ BY KZ KG MD RU TJ TM UZ SU',
  europe: 'AL AD AT BE BA BG HR CY CZ DK EE FI FR DE GE GR HU IS IE IT XK LV LI LT LU MT MC ME NL MK NO PL PT RO SM RS SK SI ES SE CH TR UA GB VA',
  america: 'US CA MX BR AR CL CO PE VE UY PY BO EC CR PA CU DO JM GT HN SV NI HT PR',
  asia: 'CN HK TW JP KR KP IN PK BD LK TH VN ID PH MY SG KH LA MM NP BT MN AF IR IQ IL PS JO LB SY SA AE QA KW OM YE BH',
  other: 'AU NZ ZA EG MA NG KE ET TN DZ GH SN TZ ZW UG CM MG FJ',
} as const

export const regionOptions = [
  { value: 'all', label: 'Все страны' },
  { value: 'without-cis', label: 'Без России и СНГ' },
  { value: 'cis', label: 'Россия и СНГ' },
  { value: 'europe', label: 'Европа' },
  { value: 'america', label: 'Америка' },
  { value: 'asia', label: 'Азия' },
  { value: 'other', label: 'Африка и Океания' },
]

const codes = new Map<string, keyof typeof groups>()
const names = new Map<string, string>()
const localized = ['ru', 'en', 'fr'].map(locale => new Intl.DisplayNames(locale, { type: 'region' }))
const normalize = (value: string) => value.trim().toLowerCase().replaceAll('ё', 'е')
for (const [group, members] of Object.entries(groups)) {
  for (const code of members.split(' ')) {
    codes.set(code, group as keyof typeof groups)
    names.set(normalize(code), code)
    for (const language of localized) {
      const name = language.of(code)
      if (name) names.set(normalize(name), code)
    }
  }
}
for (const [name, code] of Object.entries({ россия: 'RU', 'российская федерация': 'RU', ссср: 'SU', сша: 'US', usa: 'US', великобритания: 'GB', англия: 'GB', uk: 'GB', 'южная корея': 'KR', 'корея южная': 'KR', 'южно-африканская республика': 'ZA' })) names.set(name, code)

export function matchesRegion(country: string | undefined, region: string) {
  if (region === 'all') return true
  const entries = (country ?? '').split(/[,;/|]/).map(normalize)
  const regions = entries.map(name => codes.get(names.get(name) ?? ''))
  return region === 'without-cis' ? !regions.includes('cis') : regions.some(value => value === region)
}
