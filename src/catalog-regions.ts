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
for (const [name, code] of Object.entries({
  россия: 'RU', 'российская федерация': 'RU', ссср: 'SU', сша: 'US', usa: 'US',
  великобритания: 'GB', англия: 'GB', uk: 'GB',
  'южная корея': 'KR', 'корея южная': 'KR', 'корея (южная)': 'KR', 'республика корея': 'KR',
  'korea, republic of': 'KR', 'republic of korea': 'KR', 'корея северная': 'KP', 'корея (северная)': 'KP', кндр: 'KP',
  кнр: 'CN', 'китайская народная республика': 'CN', 'южно-африканская республика': 'ZA',
})) names.set(name, code)

function productionCountries(country: string | undefined) {
  const value = normalize(country ?? '')
  const exact = names.get(value)
  if (exact) return [exact]
  return value.split(/[,;/|·]/).map(name => names.get(name.trim()))
}

export function excludesCountry(country: string | undefined, excluded: readonly string[]) {
  return excluded.length > 0 && productionCountries(country).some(code => code !== undefined && excluded.includes(code))
}

export function countryOptions(locale: string) {
  const displayNames = new Intl.DisplayNames(locale, { type: 'region' })
  return [...codes.keys()].filter(code => code !== 'SU').map(code => ({
    value: code, label: displayNames.of(code) ?? code,
    aliases: [...names].filter(([, country]) => country === code).map(([name]) => name).join(' '),
  })).sort((a, b) => a.label.localeCompare(b.label, locale))
}

export function matchesRegion(country: string | undefined, region: string) {
  if (region === 'all') return true
  const regions = productionCountries(country).map(code => codes.get(code ?? ''))
  return region === 'without-cis' ? !regions.includes('cis') : regions.some(value => value === region)
}
