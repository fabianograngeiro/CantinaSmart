const NON_OPERATIONAL_CATEGORIES = new Set([
  'FERIADO',
  'RECESSO',
  'EVENTO',
  'PEDAGOGICO',
  'AVALIACAO',
  'FERIAS',
]);

const OPERATIONAL_CATEGORIES = new Set([
  'LETIVO',
]);

const NON_OPERATIONAL_LEGEND_IDS = new Set([
  'feriado',
  'recesso',
  'evento',
  'pedagogico',
  'avaliacao',
  'ferias',
]);

const OPERATIONAL_LEGEND_IDS = new Set([
  'letivo',
  'sabados_letivos',
]);

export const normalizeSchoolCalendarDateKey = (value: any) => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
};

export const getSchoolCalendarLegendCategoryMap = (legends: any[]) => {
  return new Map<string, string>(
    (Array.isArray(legends) ? legends : []).map((legend: any) => [
      String(legend?.id || '').trim().toLowerCase(),
      String(legend?.category || '').trim().toUpperCase(),
    ])
  );
};

export const isSchoolCalendarNonOperationalEvent = (
  event: any,
  categoryByLegendId: Map<string, string>
) => {
  const legendTypeId = String(event?.legendTypeId || event?.legendId || '').trim().toLowerCase();
  const category = (
    categoryByLegendId.get(legendTypeId)
    || String(event?.category || '')
  ).trim().toUpperCase();

  if (category && OPERATIONAL_CATEGORIES.has(category)) return false;
  if (category && NON_OPERATIONAL_CATEGORIES.has(category)) return true;

  if (legendTypeId && OPERATIONAL_LEGEND_IDS.has(legendTypeId)) return false;
  if (legendTypeId && NON_OPERATIONAL_LEGEND_IDS.has(legendTypeId)) return true;

  // Unknown event categories default to operational to avoid accidental overblocking.
  return false;
};

export const extractSchoolCalendarOperationalData = (
  payload: any,
  year?: number
) => {
  const legends = Array.isArray(payload?.legends) ? payload.legends : [];
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const categoryByLegendId = getSchoolCalendarLegendCategoryMap(legends);

  const blockedEvents = events.filter((event: any) => {
    const date = normalizeSchoolCalendarDateKey(event?.date);
    if (!date) return false;
    if (Number.isFinite(Number(year)) && !date.startsWith(`${year}-`)) return false;
    return isSchoolCalendarNonOperationalEvent(event, categoryByLegendId);
  });

  const blockedDates = Array.from(new Set(
    blockedEvents
      .map((event: any) => normalizeSchoolCalendarDateKey(event?.date))
      .filter(Boolean)
  ));

  const eventTitlesByDate: Record<string, string> = {};
  blockedEvents.forEach((event: any) => {
    const date = normalizeSchoolCalendarDateKey(event?.date);
    if (!date) return;
    eventTitlesByDate[date] = String(event?.title || event?.name || '').trim() || 'Dia sem funcionamento';
  });

  return {
    blockedDates,
    eventTitlesByDate,
  };
};
