const COUNTRY_CODE_TO_FLAG_BASE: Record<string, string> = {
  '1': '🇺🇸',
  '7': '🇷🇺',
  '20': '🇪🇬',
  '27': '🇿🇦',
  '30': '🇬🇷',
  '31': '🇳🇱',
  '32': '🇧🇪',
  '33': '🇫🇷',
  '34': '🇪🇸',
  '39': '🇮🇹',
  '40': '🇷🇴',
  '41': '🇨🇭',
  '44': '🇬🇧',
  '45': '🇩🇰',
  '46': '🇸🇪',
  '47': '🇳🇴',
  '48': '🇵🇱',
  '49': '🇩🇪',
  '51': '🇵🇪',
  '52': '🇲🇽',
  '53': '🇨🇺',
  '54': '🇦🇷',
  '55': '🇧🇷',
  '56': '🇨🇱',
  '57': '🇨🇴',
  '58': '🇻🇪',
  '61': '🇦🇺',
  '64': '🇳🇿',
  '81': '🇯🇵',
  '82': '🇰🇷',
  '84': '🇻🇳',
  '86': '🇨🇳',
  '91': '🇮🇳',
  '92': '🇵🇰',
  '93': '🇦🇫',
  '94': '🇱🇰',
  '95': '🇲🇲',
  '98': '🇮🇷',
  '212': '🇲🇦',
  '213': '🇩🇿',
  '216': '🇹🇳',
  '218': '🇱🇾',
  '220': '🇬🇲',
  '221': '🇸🇳',
  '222': '🇲🇷',
  '223': '🇲🇱',
  '224': '🇬🇳',
  '225': '🇨🇮',
  '226': '🇧🇫',
  '227': '🇳🇪',
  '228': '🇹🇬',
  '229': '🇧🇯',
  '230': '🇲🇺',
  '231': '🇱🇷',
  '232': '🇸🇱',
  '233': '🇬🇭',
  '234': '🇳🇬',
  '235': '🇹🇩',
  '236': '🇨🇫',
  '237': '🇨🇲',
  '238': '🇨🇻',
  '239': '🇸🇹',
  '240': '🇬🇶',
  '241': '🇬🇦',
  '242': '🇨🇬',
  '243': '🇨🇩',
  '244': '🇦🇴',
  '245': '🇬🇼',
  '246': '🇮🇴',
  '248': '🇸🇨',
  '249': '🇸🇩',
  '250': '🇷🇼',
  '251': '🇪🇹',
  '252': '🇸🇴',
  '253': '🇩🇯',
  '254': '🇰🇪',
  '255': '🇹🇿',
  '256': '🇺🇬',
  '257': '🇧🇮',
  '258': '🇲🇿',
  '260': '🇿🇲',
  '261': '🇲🇬',
  '262': '🇷🇪',
  '263': '🇿🇼',
  '264': '🇳🇦',
  '265': '🇲🇼',
  '266': '🇱🇸',
  '267': '🇧🇼',
  '268': '🇸🇿',
  '269': '🇰🇲',
  '351': '🇵🇹',
  '353': '🇮🇪',
  '354': '🇮🇸',
  '358': '🇫🇮',
  '380': '🇺🇦',
  '420': '🇨🇿',
  '507': '🇵🇦',
  '593': '🇪🇨',
  '595': '🇵🇾',
  '596': '🇬🇵',
  '597': '🇸🇷',
  '598': '🇺🇾',
  '673': '🇧🇳',
  '852': '🇭🇰',
  '853': '🇲🇴',
  '971': '🇦🇪',
};

type CountriesDatasetRow = {
  fone?: string;
  iso?: string;
};

const isoToFlagEmoji = (isoCode?: string) => {
  const code = String(isoCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return Array.from(code)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
};

const countriesDatasetModule = import.meta.glob('../backend/countriesJson_ptBR.json', { eager: true }) as Record<string, { default?: CountriesDatasetRow[] }>;
const countriesDataset = Object.values(countriesDatasetModule)[0]?.default;
const COUNTRY_CODE_TO_FLAG: Record<string, string> = { ...COUNTRY_CODE_TO_FLAG_BASE };
const COUNTRY_CODE_TO_ISO: Record<string, string> = {};

if (Array.isArray(countriesDataset)) {
  countriesDataset.forEach((country) => {
    const ddi = String(country?.fone || '').replace(/\D/g, '').replace(/^0+/, '');
    const iso = String(country?.iso || '').trim().toUpperCase();
    if (!ddi) return;
    if (/^[A-Z]{2}$/.test(iso)) {
      COUNTRY_CODE_TO_ISO[ddi] = iso;
      const emoji = isoToFlagEmoji(iso);
      if (emoji) COUNTRY_CODE_TO_FLAG[ddi] = emoji;
    }
  });
}

const COUNTRY_CODES_DESC = Object.keys(COUNTRY_CODE_TO_FLAG).sort((a, b) => b.length - a.length);

const onlyDigits = (value?: string) => String(value || '').replace(/\D/g, '');

const formatBrazilLocal = (localDigits: string) => {
  if (localDigits.length >= 11) {
    const ddd = localDigits.slice(0, 2);
    const partA = localDigits.slice(2, 7);
    const partB = localDigits.slice(7, 11);
    return `(${ddd}) ${partA}-${partB}`;
  }
  if (localDigits.length === 10) {
    const ddd = localDigits.slice(0, 2);
    const partA = localDigits.slice(2, 6);
    const partB = localDigits.slice(6, 10);
    return `(${ddd}) ${partA}-${partB}`;
  }
  return localDigits;
};

const formatGenericInternational = (countryCode: string, localDigits: string) => {
  if (!localDigits) return `+${countryCode}`;
  if (localDigits.length <= 4) return `+${countryCode} ${localDigits}`;
  if (localDigits.length <= 7) return `+${countryCode} ${localDigits.slice(0, localDigits.length - 4)}-${localDigits.slice(-4)}`;
  return `+${countryCode} ${localDigits.slice(0, 3)} ${localDigits.slice(3, 7)}-${localDigits.slice(7)}`;
};

export const splitPhoneCountryCode = (rawPhone?: string) => {
  const digits = onlyDigits(rawPhone);
  if (!digits) return { countryCode: '', localDigits: '' };
  for (const code of COUNTRY_CODES_DESC) {
    if (digits.startsWith(code) && digits.length > code.length + 5) {
      return {
        countryCode: code,
        localDigits: digits.slice(code.length),
      };
    }
  }
  return { countryCode: '', localDigits: digits };
};

export const formatPhoneWithFlag = (rawPhone?: string, fallbackText = 'Não informado') => {
  const digits = onlyDigits(rawPhone);
  if (!digits) return fallbackText;

  const { countryCode, localDigits } = splitPhoneCountryCode(digits);
  if (countryCode === '55') {
    return `🇧🇷 ${formatBrazilLocal(localDigits)}`;
  }
  if (countryCode) {
    const flag = COUNTRY_CODE_TO_FLAG[countryCode] || '🌐';
    return `${flag} ${formatGenericInternational(countryCode, localDigits)}`;
  }

  if (digits.length === 11 || digits.length === 10) {
    return `🇧🇷 ${formatBrazilLocal(digits)}`;
  }
  return digits;
};

export const formatPhoneWithCountryTag = (rawPhone?: string, fallbackText = 'Não informado') => {
  const digits = onlyDigits(rawPhone);
  if (!digits) return fallbackText;

  const { countryCode, localDigits } = splitPhoneCountryCode(digits);
  const countryIso = COUNTRY_CODE_TO_ISO[countryCode] || (countryCode === '55' ? 'BR' : '');

  if (countryCode === '55') {
    return `[BR] ${formatBrazilLocal(localDigits)}`;
  }
  if (countryCode) {
    const localFormatted = formatGenericInternational(countryCode, localDigits);
    return countryIso ? `[${countryIso}] ${localFormatted}` : `[+${countryCode}] ${localFormatted}`;
  }

  if (digits.length === 11 || digits.length === 10) {
    return `[BR] ${formatBrazilLocal(digits)}`;
  }
  return digits;
};
