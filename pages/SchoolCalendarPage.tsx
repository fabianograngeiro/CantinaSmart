import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2, Save, Download, Flag, Tags, School, Edit3, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { Enterprise, User } from '../types';
import { ApiService } from '../services/api';

interface SchoolCalendarPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

type LegendCategory = 'FERIADO' | 'RECESSO' | 'EVENTO' | 'AVALIACAO' | 'PEDAGOGICO' | 'LETIVO';

interface LegendTypeItem {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  category: LegendCategory;
}

interface SchoolCalendarEvent {
  id: string;
  date: string;
  title: string;
  legendTypeId: string;
  notes: string;
}

interface AnnualModelMeta {
  schoolYear: number;
  periodStart: string;
  periodEnd: string;
  plannedSchoolDays: number;
  notes: string;
}

interface MonthEventSummaryLine {
  id: string;
  color: string;
  intervalLabel: string;
  title: string;
  firstDay: number;
}

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const PDF_MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const WEEKDAY_SHORT = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const PDF_WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const LEGEND_CATEGORIES: Array<{ value: LegendCategory; label: string }> = [
  { value: 'FERIADO', label: 'Feriado' },
  { value: 'RECESSO', label: 'Recesso' },
  { value: 'EVENTO', label: 'Evento Escolar' },
  { value: 'AVALIACAO', label: 'Avaliacao' },
  { value: 'PEDAGOGICO', label: 'Atividade Pedagogica' },
  { value: 'LETIVO', label: 'Dia Letivo Especial' },
];

const DEFAULT_LEGENDS: LegendTypeItem[] = [
  { id: 'ferias', name: 'Ferias', shortCode: 'FE', color: '#808080', category: 'RECESSO' },
  { id: 'inicio_termino_aulas', name: 'Inicio/termino das aulas', shortCode: 'IA', color: '#fff200', category: 'LETIVO' },
  { id: 'planejamento_pedagogico', name: 'Planejamento Pedagogico', shortCode: 'PP', color: '#d97706', category: 'PEDAGOGICO' },
  { id: 'sabados_letivos', name: 'Sabados Letivos', shortCode: 'SL', color: '#0070c0', category: 'LETIVO' },
  { id: 'conselho_classe', name: 'Conselho de Classe', shortCode: 'CC', color: '#8bc34a', category: 'EVENTO' },
  { id: 'feriado', name: 'Feriados', shortCode: 'FH', color: '#ff0000', category: 'FERIADO' },
  { id: 'recesso', name: 'Recesso', shortCode: 'RC', color: '#ef7f7f', category: 'RECESSO' },
  { id: 'resultado_final', name: 'Resultado Final', shortCode: 'RF', color: '#2dd4d4', category: 'AVALIACAO' },
  { id: 'adaptacao_ed_infantil', name: 'Adaptacao Ed Infantil II e III', shortCode: 'AD', color: '#e9d48a', category: 'EVENTO' },
];

const normalizeLegendsWithPdfModel = (input: LegendTypeItem[]): LegendTypeItem[] => {
  const source = Array.isArray(input) ? input : [];
  const sourceById = new Map(source.map((legend) => [legend.id, legend]));
  const mergedBase = DEFAULT_LEGENDS.map((base) => {
    const fromSource = sourceById.get(base.id);
    return fromSource ? { ...base, ...fromSource, id: base.id } : base;
  });
  const custom = source.filter((legend) => !DEFAULT_LEGENDS.some((base) => base.id === legend.id));
  return [...mergedBase, ...custom];
};

const buildDefaultNationalHolidays = (year: number): SchoolCalendarEvent[] => {
  const y = String(year);
  return [
    { id: `holiday-${y}-01-01`, date: `${y}-01-01`, title: 'Confraternizacao Universal', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-04-21`, date: `${y}-04-21`, title: 'Tiradentes', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-05-01`, date: `${y}-05-01`, title: 'Dia do Trabalhador', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-09-07`, date: `${y}-09-07`, title: 'Independencia do Brasil', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-10-12`, date: `${y}-10-12`, title: 'Nossa Senhora Aparecida', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-11-02`, date: `${y}-11-02`, title: 'Finados', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-11-15`, date: `${y}-11-15`, title: 'Proclamacao da Republica', legendTypeId: 'feriado', notes: '' },
    { id: `holiday-${y}-12-25`, date: `${y}-12-25`, title: 'Natal', legendTypeId: 'feriado', notes: '' },
  ];
};

const toMondayStart = (jsDay: number): number => (jsDay + 6) % 7;

const buildMonthGrid = (year: number, monthIndex: number): Array<Array<number | null>> => {
  const first = new Date(year, monthIndex, 1);
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const startOffset = toMondayStart(first.getDay());
  const cells: Array<number | null> = Array.from({ length: startOffset }, () => null);
  for (let d = 1; d <= totalDays; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
};

const buildMonthGridSundayStart = (year: number, monthIndex: number): Array<Array<number | null>> => {
  const first = new Date(year, monthIndex, 1);
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const startOffset = first.getDay();
  const cells: Array<number | null> = Array.from({ length: startOffset }, () => null);
  for (let d = 1; d <= totalDays; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);

  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
};

const hexToRgb = (hexColor: string): { r: number; g: number; b: number } => {
  const clean = String(hexColor || '').replace('#', '').padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
};

const softTintFromHex = (hexColor: string, alpha = 0.16): string => {
  const { r, g, b } = hexToRgb(hexColor);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getPdfTextColorFromHex = (hexColor: string): [number, number, number] => {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
  return luminance > 155 ? [17, 24, 39] : [255, 255, 255];
};

const SchoolCalendarPage: React.FC<SchoolCalendarPageProps> = ({ currentUser, activeEnterprise }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [legends, setLegends] = useState<LegendTypeItem[]>(DEFAULT_LEGENDS);
  const [events, setEvents] = useState<SchoolCalendarEvent[]>(buildDefaultNationalHolidays(currentYear));
  const [legendForm, setLegendForm] = useState<Omit<LegendTypeItem, 'id'>>({
    name: '',
    shortCode: '',
    color: '#2563eb',
    category: 'EVENTO',
  });
  const [eventForm, setEventForm] = useState({
    date: '',
    title: '',
    legendTypeId: 'feriado',
    notes: '',
  });
  const [meta, setMeta] = useState<AnnualModelMeta>({
    schoolYear: currentYear,
    periodStart: `${currentYear}-02-01`,
    periodEnd: `${currentYear}-12-20`,
    plannedSchoolDays: 200,
    notes: '',
  });
  const [editingLegendId, setEditingLegendId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedDateTitles, setSelectedDateTitles] = useState<Record<string, string>>({});
  const [showBatchActionModal, setShowBatchActionModal] = useState(false);
  const [batchActionMode, setBatchActionMode] = useState<'create' | 'edit' | 'delete'>('create');
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [isCalendarSaving, setIsCalendarSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const enterpriseId = String(activeEnterprise?.id || '').trim();
    if (!enterpriseId) return;

    let cancelled = false;

    const resetSelectionState = () => {
      setEventForm((prev) => ({ ...prev, legendTypeId: 'feriado' }));
      setEditingLegendId(null);
      setEditingEventId(null);
      setSelectedDates([]);
      setSelectedDateTitles({});
      setShowBatchActionModal(false);
      setBatchActionMode('create');
    };

    const setDefaults = () => {
      setLegends(normalizeLegendsWithPdfModel(DEFAULT_LEGENDS));
      setEvents(buildDefaultNationalHolidays(selectedYear));
      setMeta({
        schoolYear: selectedYear,
        periodStart: `${selectedYear}-02-01`,
        periodEnd: `${selectedYear}-12-20`,
        plannedSchoolDays: 200,
        notes: '',
      });
      setLastSavedAt(null);
    };

    const loadCalendar = async () => {
      setIsCalendarLoading(true);
      try {
        const payload = await ApiService.getSchoolCalendar(enterpriseId, selectedYear);
        if (cancelled) return;

        const hasStoredData = Boolean(
          (payload?.meta && typeof payload.meta === 'object')
          || (Array.isArray(payload?.legends) && payload.legends.length > 0)
          || (Array.isArray(payload?.events) && payload.events.length > 0)
        );

        if (!hasStoredData) {
          setDefaults();
          return;
        }

        setLegends(normalizeLegendsWithPdfModel(Array.isArray(payload?.legends) ? payload.legends : DEFAULT_LEGENDS));
        setEvents(Array.isArray(payload?.events) ? payload.events : buildDefaultNationalHolidays(selectedYear));
        setMeta({
          schoolYear: selectedYear,
          periodStart: String(payload?.meta?.periodStart || `${selectedYear}-02-01`),
          periodEnd: String(payload?.meta?.periodEnd || `${selectedYear}-12-20`),
          plannedSchoolDays: Number(payload?.meta?.plannedSchoolDays || 200),
          notes: String(payload?.meta?.notes || ''),
        });
        setLastSavedAt(payload?.updatedAt ? String(payload.updatedAt) : null);
      } catch (error) {
        console.error('Erro ao carregar calendário escolar:', error);
        if (cancelled) return;
        setDefaults();
      } finally {
        if (!cancelled) {
          resetSelectionState();
          setIsCalendarLoading(false);
        }
      }
    };

    loadCalendar();

    return () => {
      cancelled = true;
    };
  }, [selectedYear, activeEnterprise?.id]);

  const persistCalendar = useCallback(async (showFeedback = false) => {
    const enterpriseId = String(activeEnterprise?.id || '').trim();
    if (!enterpriseId) return false;

    try {
      setIsCalendarSaving(true);
      const response = await ApiService.saveSchoolCalendar(enterpriseId, selectedYear, {
        meta: {
          ...meta,
          schoolYear: selectedYear,
        },
        legends,
        events,
      });
      const savedAt = response?.data?.updatedAt || new Date().toISOString();
      setLastSavedAt(String(savedAt));
      if (showFeedback) {
        setSaveFeedback({ type: 'success', message: 'Calendário salvo com sucesso no banco de dados.' });
      }
      return true;
    } catch (error) {
      console.error('Erro ao salvar calendário escolar:', error);
      if (showFeedback) {
        setSaveFeedback({ type: 'error', message: 'Não foi possível salvar o calendário agora.' });
      }
      return false;
    } finally {
      setIsCalendarSaving(false);
    }
  }, [activeEnterprise?.id, selectedYear, meta, legends, events]);

  useEffect(() => {
    const enterpriseId = String(activeEnterprise?.id || '').trim();
    if (!enterpriseId || isCalendarLoading) return;

    const timerId = window.setTimeout(() => {
      void persistCalendar(false);
    }, 700);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activeEnterprise?.id, selectedYear, legends, events, meta, isCalendarLoading, persistCalendar]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timer = window.setTimeout(() => setSaveFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);

  const legendById = useMemo(
    () => new Map(legends.map((legend) => [legend.id, legend])),
    [legends]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, SchoolCalendarEvent[]>();
    events.forEach((ev) => {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    });
    return map;
  }, [events]);

  const monthSummaryByIndex = useMemo(() => {
    const map = new Map<number, MonthEventSummaryLine[]>();

    const normalizeIntervals = (days: number[]) => {
      const sorted = Array.from(new Set(days)).sort((a, b) => a - b);
      const ranges: Array<{ start: number; end: number }> = [];
      sorted.forEach((day) => {
        const last = ranges[ranges.length - 1];
        if (!last) {
          ranges.push({ start: day, end: day });
          return;
        }
        if (day === last.end + 1) {
          last.end = day;
          return;
        }
        ranges.push({ start: day, end: day });
      });
      return ranges;
    };

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const grouped = new Map<string, { legendId: string; title: string; notes: string; days: number[] }>();

      events.forEach((ev) => {
        const [yearRaw, monthRaw, dayRaw] = String(ev.date || '').split('-');
        const y = Number(yearRaw);
        const m = Number(monthRaw);
        const d = Number(dayRaw);
        if (y !== selectedYear || m !== (monthIndex + 1) || !d) return;

        const key = `${ev.legendTypeId}|${String(ev.title || '').trim().toLowerCase()}|${String(ev.notes || '').trim().toLowerCase()}`;
        const current = grouped.get(key) || {
          legendId: ev.legendTypeId,
          title: String(ev.title || '').trim(),
          notes: String(ev.notes || '').trim(),
          days: [],
        };
        current.days.push(d);
        grouped.set(key, current);
      });

      const lines: MonthEventSummaryLine[] = [];
      grouped.forEach((group, key) => {
        const ranges = normalizeIntervals(group.days);
        const intervalLabel = ranges
          .map((range) => (range.start === range.end ? `${range.start}` : `${range.start} a ${range.end}`))
          .join(', ');
        const legend = legendById.get(group.legendId);
        const title = group.notes ? `${group.title} (${group.notes})` : group.title;
        lines.push({
          id: key,
          color: legend?.color || '#64748b',
          intervalLabel,
          title,
          firstDay: Math.min(...group.days),
        });
      });

      lines.sort((a, b) => a.firstDay - b.firstDay || a.title.localeCompare(b.title));
      map.set(monthIndex, lines);
    }

    return map;
  }, [events, legendById, selectedYear]);

  const lastSelectedDate = selectedDates[selectedDates.length - 1] || null;
  const lastSelectedDateEvents = useMemo(() => {
    if (!lastSelectedDate) return [];
    return (eventsByDate.get(lastSelectedDate) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
  }, [eventsByDate, lastSelectedDate]);

  const toggleDateSelection = (dateKey: string) => {
    if (!dateKey) return;
    setSelectedDates((prev) => {
      if (prev.includes(dateKey)) {
        setSelectedDateTitles((current) => {
          const next = { ...current };
          delete next[dateKey];
          return next;
        });
        return prev.filter((date) => date !== dateKey);
      }
      return [...prev, dateKey];
    });
  };

  const cancelMultiSelect = () => {
    setSelectedDates([]);
    setSelectedDateTitles({});
    setShowBatchActionModal(false);
    setEditingEventId(null);
    setBatchActionMode('create');
  };

  const openBatchActionModal = () => {
    if (selectedDates.length === 0) return;
    setBatchActionMode('create');
    setEditingEventId(null);
    setEventForm((prev) => ({
      ...prev,
      date: '',
      title: '',
      notes: '',
      legendTypeId: legends.some((legend) => legend.id === prev.legendTypeId)
        ? prev.legendTypeId
        : (legends[0]?.id || ''),
    }));
    setShowBatchActionModal(true);
  };

  const openExistingEventActionModal = (mode: 'edit' | 'delete') => {
    if (!lastSelectedDate || lastSelectedDateEvents.length === 0) return;
    setBatchActionMode(mode);
    setEditingEventId(null);
    setShowBatchActionModal(true);
  };

  const beginModalEventEdit = (ev: SchoolCalendarEvent) => {
    setEventForm({
      date: ev.date,
      title: ev.title,
      legendTypeId: ev.legendTypeId,
      notes: ev.notes,
    });
    setEditingEventId(ev.id);
    setBatchActionMode('edit');
    setShowBatchActionModal(true);
  };

  const applyEventToSelectedDates = () => {
    const defaultTitle = eventForm.title.trim();
    if (!eventForm.legendTypeId || selectedDates.length === 0) return;
    const fallbackTitle = legendById.get(eventForm.legendTypeId)?.name || 'Evento';

    const notes = eventForm.notes.trim();
    setEvents((prev) => {
      const existing = [...prev];
      const additions: SchoolCalendarEvent[] = [];
      selectedDates.forEach((date) => {
        const resolvedTitle = String(selectedDateTitles[date] || '').trim() || defaultTitle || fallbackTitle;
        if (!resolvedTitle) return;
        const alreadyExists = existing.some((ev) => (
          ev.date === date
          && ev.title.trim().toLowerCase() === resolvedTitle.toLowerCase()
          && ev.legendTypeId === eventForm.legendTypeId
        ));
        if (!alreadyExists) {
          additions.push({
            id: `event-${Date.now()}-${date}-${Math.random().toString(36).slice(2, 7)}`,
            date,
            title: resolvedTitle,
            legendTypeId: eventForm.legendTypeId,
            notes,
          });
        }
      });
      return [...existing, ...additions].sort((a, b) => a.date.localeCompare(b.date));
    });

    setEventForm((prev) => ({ ...prev, title: '', notes: '' }));
    setShowBatchActionModal(false);
    setSelectedDates([]);
    setSelectedDateTitles({});
  };

  useEffect(() => {
    if (!legends.length) return;
    const hasSelectedLegend = legends.some((legend) => legend.id === eventForm.legendTypeId);
    if (!hasSelectedLegend) {
      setEventForm((prev) => ({ ...prev, legendTypeId: legends[0].id }));
    }
  }, [legends, eventForm.legendTypeId]);

  const saveLegend = () => {
    const name = legendForm.name.trim();
    const shortCode = legendForm.shortCode.trim().toUpperCase();
    if (!name || !shortCode) return;
    if (editingLegendId) {
      setLegends((prev) => prev.map((legend) => (
        legend.id === editingLegendId
          ? { ...legend, name, shortCode, color: legendForm.color, category: legendForm.category }
          : legend
      )));
      setEditingLegendId(null);
    } else {
      const id = `${shortCode.toLowerCase()}-${Date.now()}`;
      const next = { ...legendForm, name, shortCode, id };
      setLegends((prev) => [...prev, next]);
    }
    setLegendForm({ name: '', shortCode: '', color: '#2563eb', category: 'EVENTO' });
  };

  const editLegend = (legend: LegendTypeItem) => {
    setLegendForm({
      name: legend.name,
      shortCode: legend.shortCode,
      color: legend.color,
      category: legend.category,
    });
    setEditingLegendId(legend.id);
  };

  const cancelLegendEdit = () => {
    setLegendForm({ name: '', shortCode: '', color: '#2563eb', category: 'EVENTO' });
    setEditingLegendId(null);
  };

  const removeLegend = (legendId: string) => {
    setLegends((prev) => prev.filter((legend) => legend.id !== legendId));
    setEvents((prev) => prev.filter((ev) => ev.legendTypeId !== legendId));
    if (editingLegendId === legendId) {
      cancelLegendEdit();
    }
  };

  const saveEvent = () => {
    const date = eventForm.date;
    if (!date || !eventForm.legendTypeId) return;
    const title = eventForm.title.trim() || legendById.get(eventForm.legendTypeId)?.name || 'Evento';
    if (editingEventId) {
      setEvents((prev) => prev
        .map((ev) => (ev.id === editingEventId ? {
          ...ev,
          date,
          title,
          legendTypeId: eventForm.legendTypeId,
          notes: eventForm.notes.trim(),
        } : ev))
        .sort((a, b) => a.date.localeCompare(b.date)));
      setEditingEventId(null);
    } else {
      const next: SchoolCalendarEvent = {
        id: `event-${Date.now()}`,
        date,
        title,
        legendTypeId: eventForm.legendTypeId,
        notes: eventForm.notes.trim(),
      };
      setEvents((prev) => [...prev, next].sort((a, b) => a.date.localeCompare(b.date)));
    }
    setEventForm((prev) => ({ ...prev, title: '', date: '', notes: '' }));
  };

  const editEvent = (ev: SchoolCalendarEvent) => {
    setEventForm({
      date: ev.date,
      title: ev.title,
      legendTypeId: ev.legendTypeId,
      notes: ev.notes,
    });
    setEditingEventId(ev.id);
  };

  const cancelEventEdit = () => {
    setEventForm((prev) => ({ ...prev, title: '', date: '', notes: '' }));
    setEditingEventId(null);
  };

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    if (editingEventId === id) {
      cancelEventEdit();
    }
  };

  const exportAnnualPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedAt = new Date();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 6;
    const headerY = 8;
    const topStartY = 22;
    const bottomMargin = 7;
    const cols = 4;
    const rows = 3;
    const colGap = 3;
    const rowGap = 3;
    const monthWidth = (pageWidth - marginX * 2 - (cols - 1) * colGap) / cols;
    const monthHeight = (pageHeight - topStartY - bottomMargin - (rows - 1) * rowGap) / rows;
    const monthHeaderH = 5;
    const weekdayH = 4.2;
    const summaryAreaH = 12;
    const gridAreaH = monthHeight - monthHeaderH - weekdayH - summaryAreaH;
    const cellWidth = monthWidth / 7;
    const cellHeight = gridAreaH / 6;
    const sundayPurple: [number, number, number] = [122, 66, 177];
    const borderColor: [number, number, number] = [25, 25, 25];

    doc.setFillColor(sundayPurple[0], sundayPurple[1], sundayPurple[2]);
    doc.rect(marginX, headerY, pageWidth - marginX * 2, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`CALENDARIO ESCOLAR ${selectedYear}`, pageWidth / 2, headerY + 5.8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.text(`${activeEnterprise?.name || 'Unidade'} • Dias letivos: ${meta.plannedSchoolDays}`, pageWidth / 2, headerY + 8.1, { align: 'center' });

    MONTH_LABELS.forEach((_, monthIndex) => {
      const col = monthIndex % cols;
      const row = Math.floor(monthIndex / cols);
      const x = marginX + col * (monthWidth + colGap);
      const y = topStartY + row * (monthHeight + rowGap);
      const monthGrid = buildMonthGridSundayStart(selectedYear, monthIndex);
      const monthSummary = monthSummaryByIndex.get(monthIndex) || [];
      const monthLabel = `${PDF_MONTH_SHORT[monthIndex]}/${String(selectedYear).slice(-2)}`;

      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.25);
      doc.rect(x, y, monthWidth, monthHeight);

      doc.setFillColor(sundayPurple[0], sundayPurple[1], sundayPurple[2]);
      doc.rect(x, y, monthWidth, monthHeaderH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.text(monthLabel, x + monthWidth / 2, y + 3.5, { align: 'center' });

      PDF_WEEKDAY_SHORT.forEach((dayLabel, dayIndex) => {
        const hx = x + dayIndex * cellWidth;
        const hy = y + monthHeaderH;
        if (dayIndex === 0) {
          doc.setFillColor(sundayPurple[0], sundayPurple[1], sundayPurple[2]);
          doc.rect(hx, hy, cellWidth, weekdayH, 'F');
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setFillColor(255, 255, 255);
          doc.rect(hx, hy, cellWidth, weekdayH, 'F');
          doc.setTextColor(17, 24, 39);
        }
        doc.rect(hx, hy, cellWidth, weekdayH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.text(dayLabel, hx + cellWidth / 2, hy + 2.9, { align: 'center' });
      });

      monthGrid.forEach((week, weekIndex) => {
        week.forEach((day, dayIndex) => {
          const cx = x + dayIndex * cellWidth;
          const cy = y + monthHeaderH + weekdayH + weekIndex * cellHeight;
          const dateKey = day
            ? `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : '';
          const dayEvents = day ? (eventsByDate.get(dateKey) || []) : [];

          if (!day) {
            doc.setFillColor(255, 255, 255);
            doc.rect(cx, cy, cellWidth, cellHeight, 'FD');
            return;
          }

          if (dayEvents.length > 0) {
            const firstLegend = legendById.get(dayEvents[0].legendTypeId);
            const rgb = hexToRgb(firstLegend?.color || '#ffffff');
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.rect(cx, cy, cellWidth, cellHeight, 'F');
            const textColor = getPdfTextColorFromHex(firstLegend?.color || '#ffffff');
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          } else if (dayIndex === 0) {
            doc.setFillColor(sundayPurple[0], sundayPurple[1], sundayPurple[2]);
            doc.rect(cx, cy, cellWidth, cellHeight, 'F');
            doc.setTextColor(255, 255, 255);
          } else {
            doc.setFillColor(255, 255, 255);
            doc.rect(cx, cy, cellWidth, cellHeight, 'F');
            doc.setTextColor(17, 24, 39);
          }

          doc.rect(cx, cy, cellWidth, cellHeight);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.text(String(day), cx + cellWidth / 2, cy + 3.5, { align: 'center' });
        });
      });

      const summaryY = y + monthHeaderH + weekdayH + (cellHeight * 6);
      doc.line(x, summaryY, x + monthWidth, summaryY);

      const maxSummaryLines = Math.max(1, Math.floor((summaryAreaH - 1.5) / 2.7));
      const linesToRender = monthSummary.slice(0, maxSummaryLines);
      const hiddenLines = Math.max(0, monthSummary.length - maxSummaryLines);
      let lineY = summaryY + 2.4;
      linesToRender.forEach((line) => {
        const rgb = hexToRgb(line.color);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(x + 1.4, lineY - 1.2, 2.1, 2.1, 'F');
        doc.setTextColor(17, 24, 39);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.7);
        doc.text(`${line.intervalLabel} - ${line.title}`, x + 4.4, lineY + 0.4, { maxWidth: monthWidth - 5.8 });
        lineY += 2.8;
      });

      if (hiddenLines > 0) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.4);
        doc.text(`+${hiddenLines} evento(s)`, x + 1.4, y + monthHeight - 1.2);
      }
    });

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text(`Gerado em ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`, pageWidth - 55, pageHeight - 2.5);
    doc.save(`calendario_escolar_${selectedYear}_${(activeEnterprise?.name || 'unidade').toLowerCase().replace(/\s+/g, '_')}.pdf`);
  };

  const eventCountByCategory = useMemo(() => {
    const counters: Record<LegendCategory, number> = {
      FERIADO: 0,
      RECESSO: 0,
      EVENTO: 0,
      AVALIACAO: 0,
      PEDAGOGICO: 0,
      LETIVO: 0,
    };

    events.forEach((ev) => {
      const legend = legendById.get(ev.legendTypeId);
      if (legend?.category) counters[legend.category] += 1;
    });

    return counters;
  }, [events, legendById]);

  return (
    <div className="dash-shell min-h-screen p-4 md:p-6 space-y-5">
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 dark:text-zinc-100 flex items-center gap-2">
              <CalendarDays className="text-indigo-600" size={24} />
              CALENDARIO ESCOLAR
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Modelo anual para cadastrar feriados, eventos e tipos de legendas para toda a escola.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 w-full md:w-auto">
            <button
              onClick={exportAnnualPdf}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"
            >
              <Download size={16} />
              Baixar Calendario PDF
            </button>
            <button
              onClick={() => {
                void persistCalendar(true);
              }}
              disabled={isCalendarLoading || isCalendarSaving}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm"
            >
              <Save size={16} />
              Salvar Agora
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {isCalendarLoading
            ? 'Carregando calendário salvo no banco de dados...'
            : (isCalendarSaving
              ? 'Salvando alterações no banco de dados...'
              : (lastSavedAt
                ? `Último salvamento: ${new Date(lastSavedAt).toLocaleString('pt-BR')}`
                : 'Sem registro salvo para este ano e unidade.'))}
        </div>
        {saveFeedback && (
          <div className={`mt-2 text-xs font-black ${saveFeedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
            {saveFeedback.message}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Unidade</span>
            <div className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 flex items-center text-sm text-slate-700 dark:text-slate-100 font-bold">
              <School size={16} className="mr-2 text-indigo-600" />
              {activeEnterprise?.name || '-'}
            </div>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Ano Letivo</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={selectedYear}
              onChange={(e) => {
                const y = Number(e.target.value || currentYear);
                setSelectedYear(y);
                setMeta((prev) => ({ ...prev, schoolYear: y }));
              }}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-semibold"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Inicio do Periodo Letivo</span>
            <input
              type="date"
              value={meta.periodStart}
              onChange={(e) => setMeta((prev) => ({ ...prev, periodStart: e.target.value }))}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-semibold"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Fim do Periodo Letivo</span>
            <input
              type="date"
              value={meta.periodEnd}
              onChange={(e) => setMeta((prev) => ({ ...prev, periodEnd: e.target.value }))}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-semibold"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Dias Letivos Planejados</span>
            <input
              type="number"
              min={0}
              max={300}
              value={meta.plannedSchoolDays}
              onChange={(e) => setMeta((prev) => ({ ...prev, plannedSchoolDays: Number(e.target.value || 0) }))}
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-semibold"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Observacoes Gerais</span>
            <input
              type="text"
              value={meta.notes}
              onChange={(e) => setMeta((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Observacoes do calendario anual"
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-semibold"
            />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-800 dark:text-zinc-100 flex items-center gap-2">
            <Tags size={18} className="text-indigo-600" />
            Tipos de Legenda
          </h2>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={legendForm.name}
              onChange={(e) => setLegendForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nome da legenda"
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm md:col-span-2 bg-white dark:bg-slate-800"
            />
            <input
              value={legendForm.shortCode}
              onChange={(e) => setLegendForm((prev) => ({ ...prev, shortCode: e.target.value.slice(0, 3).toUpperCase() }))}
              placeholder="Sigla"
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
            />
            <input
              type="color"
              value={legendForm.color}
              onChange={(e) => setLegendForm((prev) => ({ ...prev, color: e.target.value }))}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-2 bg-white dark:bg-slate-800"
            />
            <select
              value={legendForm.category}
              onChange={(e) => setLegendForm((prev) => ({ ...prev, category: e.target.value as LegendCategory }))}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm md:col-span-3 bg-white dark:bg-slate-800"
            >
              {LEGEND_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            <button
              onClick={saveLegend}
              className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1"
            >
              <Save size={15} />
              {editingLegendId ? 'Salvar Tipo' : 'Adicionar'}
            </button>
            {editingLegendId && (
              <button
                onClick={cancelLegendEdit}
                className="h-10 rounded-xl border border-slate-300 text-slate-700 dark:text-slate-200 text-sm font-bold inline-flex items-center justify-center gap-1"
              >
                <X size={15} />
                Cancelar
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2 max-h-60 overflow-auto pr-1">
            {legends.map((legend) => (
              <div key={legend.id} className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: legend.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-100 truncate">{legend.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{legend.shortCode} • {legend.category}</p>
                </div>
                <button
                  onClick={() => editLegend(legend)}
                  className="h-8 w-8 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 inline-flex items-center justify-center"
                  title="Editar tipo"
                >
                  <Edit3 size={14} />
                </button>
                {![
                  'ferias',
                  'inicio_termino_aulas',
                  'planejamento_pedagogico',
                  'sabados_letivos',
                  'conselho_classe',
                  'feriado',
                  'recesso',
                  'resultado_final',
                  'adaptacao_ed_infantil',
                ].includes(legend.id) && (
                  <button
                    onClick={() => removeLegend(legend.id)}
                    className="h-8 w-8 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                    title="Remover tipo"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-800 dark:text-zinc-100 flex items-center gap-2">
            <Flag size={18} className="text-indigo-600" />
            Cadastro de Feriados e Eventos
          </h2>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openBatchActionModal}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800 inline-flex items-center gap-2 text-left"
              title="Selecione os dias no calendario e clique para acao"
            >
              <CalendarDays size={16} className="text-indigo-600" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {selectedDates.length > 0
                  ? `${selectedDates.length} dia(s) selecionado(s) no calendario`
                  : 'Clique nos dias do calendario para selecionar'}
              </span>
            </button>
            <input
              value={eventForm.title}
              onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Titulo do feriado/evento (edicao individual)"
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
            />
            <select
              value={eventForm.legendTypeId}
              onChange={(e) => setEventForm((prev) => ({ ...prev, legendTypeId: e.target.value }))}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
            >
              {legends.map((legend) => (
                <option key={legend.id} value={legend.id}>{legend.shortCode} - {legend.name}</option>
              ))}
            </select>
            <input
              value={eventForm.notes}
              onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Observacao"
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
            />
            <button
              onClick={saveEvent}
              disabled={!editingEventId}
              className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold inline-flex items-center justify-center gap-1 md:col-span-2"
            >
              <Save size={15} />
              {editingEventId ? 'Salvar Edicao Individual' : 'Edite um item da lista para salvar'}
            </button>
            {editingEventId && (
              <button
                onClick={cancelEventEdit}
                className="h-10 rounded-xl border border-slate-300 text-slate-700 dark:text-slate-200 text-sm font-bold inline-flex items-center justify-center gap-1 md:col-span-2"
              >
                <X size={15} />
                Cancelar Edicao
              </button>
            )}
          </div>

          <div className="mt-4 max-h-72 overflow-auto pr-1 space-y-2">
            {events.map((ev) => {
              const legend = legendById.get(ev.legendTypeId);
              return (
                <div key={ev.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 w-3 h-3 rounded-full" style={{ backgroundColor: legend?.color || '#94a3b8' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-100 truncate">{ev.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{ev.date} • {legend?.shortCode || '-'} - {legend?.name || 'Sem legenda'}</p>
                      {ev.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Obs: {ev.notes}</p>}
                    </div>
                    <button
                      onClick={() => editEvent(ev)}
                      className="h-8 w-8 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 inline-flex items-center justify-center"
                      title="Editar item"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      className="h-8 w-8 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                      title="Remover item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 shadow-sm">
        <h2 className="text-lg font-black text-gray-800 dark:text-zinc-100">Modelo Anual • {selectedYear}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Grade anual com 12 meses. Cada dia mostra as legendas cadastradas para visualizacao rapida.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {MONTH_LABELS.map((label, monthIndex) => {
            const monthGrid = buildMonthGrid(selectedYear, monthIndex);
            const monthSummary = monthSummaryByIndex.get(monthIndex) || [];
            return (
              <article key={label} className="rounded-2xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                <header className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-700">
                  <h3 className="text-sm font-black text-indigo-700 dark:text-indigo-300">{label}</h3>
                </header>
                <div className="p-2">
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {WEEKDAY_SHORT.map((day) => (
                      <div key={`${label}-${day}`} className="text-[10px] text-center font-black text-slate-600 bg-slate-100 dark:bg-slate-800 rounded py-0.5">{day}</div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {monthGrid.map((week, weekIdx) => (
                      <div key={`${label}-w-${weekIdx}`} className="grid grid-cols-7 gap-1">
                        {week.map((day, dayIdx) => {
                          const dateKey = day
                            ? `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                            : '';
                          const dayEvents = day ? (eventsByDate.get(dateKey) || []) : [];
                          const isSelected = Boolean(day && selectedDates.includes(dateKey));
                          const isLastSelected = Boolean(day && selectedDates[selectedDates.length - 1] === dateKey);
                          return (
                            <div
                              key={`${label}-${weekIdx}-${dayIdx}`}
                              onClick={() => day && toggleDateSelection(dateKey)}
                              className={`relative rounded-lg border ${day ? 'cursor-pointer transition-all' : 'border-transparent bg-transparent'} p-1 ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-300 dark:ring-indigo-700' : (day ? 'border-slate-300 dark:border-slate-700 hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700' : '')}`}
                              style={{
                                minHeight: `${66 + Math.max(0, dayEvents.length - 2) * 12}px`,
                                ...(dayEvents[0]
                                  ? { backgroundColor: softTintFromHex(legendById.get(dayEvents[0].legendTypeId)?.color || '#ffffff', 0.14) }
                                  : {}),
                              }}
                            >
                              {day && (
                                <>
                                  <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">{day}</div>
                                  {isLastSelected && selectedDates.length > 0 && (
                                    <div className="absolute right-1 top-1 flex items-center gap-1 z-10 flex-wrap justify-end max-w-[calc(100%-18px)]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openBatchActionModal();
                                        }}
                                        className="h-5 px-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black"
                                      >
                                        CRIAR
                                      </button>
                                      {dayEvents.length > 0 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openExistingEventActionModal('edit');
                                          }}
                                          className="h-5 px-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black"
                                        >
                                          EDITAR
                                        </button>
                                      )}
                                      {dayEvents.length > 0 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openExistingEventActionModal('delete');
                                          }}
                                          className="h-5 px-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black"
                                        >
                                          EXCLUIR
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelMultiSelect();
                                        }}
                                        className="h-5 px-1.5 rounded border border-slate-300 bg-white/90 text-slate-700 text-[9px] font-black"
                                      >
                                        CANCELAR
                                      </button>
                                    </div>
                                  )}
                                  <div className="mt-1 space-y-1">
                                    {dayEvents.map((ev) => {
                                      const legend = legendById.get(ev.legendTypeId);
                                      return (
                                        <div
                                          key={ev.id}
                                          className="text-[9px] leading-none px-1 py-0.5 rounded text-white font-bold truncate"
                                          style={{ backgroundColor: legend?.color || '#64748b' }}
                                          title={`${ev.title} (${legend?.name || 'Sem legenda'})`}
                                        >
                                          {(legend?.shortCode || '?')}: {ev.title}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 border-t border-slate-300 dark:border-slate-700 pt-2 space-y-1">
                    {monthSummary.length === 0 ? (
                      <p className="text-[10px] font-semibold text-slate-400">Sem eventos neste mes</p>
                    ) : (
                      monthSummary.map((line) => (
                        <div key={line.id} className="flex items-start gap-1.5">
                          <span className="mt-0.5 inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: line.color }} />
                          <p className="text-[10px] leading-snug text-slate-700 dark:text-slate-200 font-semibold">
                            {line.intervalLabel} - {line.title}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showBatchActionModal && selectedDates.length > 0 && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[90] flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                  {batchActionMode === 'create' ? 'CRIAR evento em lote' : batchActionMode === 'edit' ? 'EDITAR evento existente' : 'EXCLUIR evento existente'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {batchActionMode === 'create'
                    ? `Aplicar evento em ${selectedDates.length} dia(s) selecionado(s)`
                    : `Escolha o evento em ${lastSelectedDate || '-'} para ${batchActionMode === 'edit' ? 'editar' : 'excluir'}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowBatchActionModal(false);
                  setBatchActionMode('create');
                  setEditingEventId(null);
                }}
                className="h-9 w-9 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {batchActionMode === 'create' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={eventForm.title}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Titulo padrao do evento"
                      className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
                    />
                    <select
                      value={eventForm.legendTypeId}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, legendTypeId: e.target.value }))}
                      className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
                    >
                      {legends.map((legend) => (
                        <option key={legend.id} value={legend.id}>{legend.shortCode} - {legend.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={eventForm.notes}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Observacao (opcional)"
                      className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800 md:col-span-2"
                    />
                    <button
                      onClick={applyEventToSelectedDates}
                      className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1 md:col-span-2"
                    >
                      <Save size={15} />
                      Aplicar Evento em Todos Selecionados
                    </button>
                  </div>

                  <div className="max-h-72 overflow-auto space-y-2 pr-1">
                    {selectedDates.length === 0 && (
                      <div className="text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3">
                        Nenhum dia selecionado.
                      </div>
                    )}
                    {selectedDates.map((date) => {
                      const dateEvents = eventsByDate.get(date) || [];
                      return (
                        <div key={date} className="border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-700 dark:text-slate-100">{date}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {dateEvents.length} evento(s) ja cadastrado(s) neste dia
                              </p>
                              <input
                                type="text"
                                value={selectedDateTitles[date] || ''}
                                onChange={(e) => setSelectedDateTitles((prev) => ({ ...prev, [date]: e.target.value }))}
                                placeholder="Titulo especifico para este dia (opcional)"
                                className="mt-2 h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
                              />
                              <p className="mt-1 text-[11px] text-slate-400">
                                Se este campo ficar vazio, sera usado o titulo padrao acima.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                    <p className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.08em]">
                      Todos os eventos cadastrados
                    </p>
                    <div className="mt-2 max-h-52 overflow-auto space-y-2 pr-1">
                      {events.length === 0 ? (
                        <div className="text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3">
                          Nenhum evento cadastrado ainda.
                        </div>
                      ) : (
                        events
                          .slice()
                          .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
                          .map((ev) => {
                            const legend = legendById.get(ev.legendTypeId);
                            return (
                              <div key={`all-events-${ev.id}`} className="border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 flex items-start gap-2">
                                <span className="mt-1 inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: legend?.color || '#94a3b8' }} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{ev.title}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{ev.date} • {legend?.shortCode || '-'} - {legend?.name || 'Sem legenda'}</p>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </>
              ) : batchActionMode === 'edit' ? (
                <div className="space-y-3">
                  {editingEventId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-amber-200 bg-amber-50/70 dark:bg-amber-950/10 rounded-xl p-3">
                      <input
                        type="text"
                        value={eventForm.title}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Titulo do evento"
                        className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
                      />
                      <select
                        value={eventForm.legendTypeId}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, legendTypeId: e.target.value }))}
                        className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800"
                      >
                        {legends.map((legend) => (
                          <option key={legend.id} value={legend.id}>{legend.shortCode} - {legend.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={eventForm.notes}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Observacao (opcional)"
                        className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-800 md:col-span-2"
                      />
                      <button
                        onClick={() => {
                          saveEvent();
                          setShowBatchActionModal(false);
                          setBatchActionMode('create');
                        }}
                        className="h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1 md:col-span-2"
                      >
                        <Save size={15} />
                        Salvar Correcao
                      </button>
                      <button
                        onClick={() => {
                          cancelEventEdit();
                        }}
                        className="h-10 rounded-xl border border-slate-300 text-slate-700 dark:text-slate-200 text-sm font-bold inline-flex items-center justify-center gap-1 md:col-span-2"
                      >
                        <X size={15} />
                        Cancelar Correcao
                      </button>
                    </div>
                  )}

                  <div className="max-h-80 overflow-auto space-y-2 pr-1">
                    {lastSelectedDateEvents.length === 0 && (
                      <div className="text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3">
                        Nenhum evento encontrado neste dia.
                      </div>
                    )}
                    {lastSelectedDateEvents.map((ev) => {
                      const legend = legendById.get(ev.legendTypeId);
                      const isActiveEdit = editingEventId === ev.id;
                      return (
                        <div key={ev.id} className={`border rounded-xl p-3 flex items-start gap-3 ${isActiveEdit ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/10' : 'border-slate-200 dark:border-slate-700'}`}>
                          <span className="mt-1 inline-block w-3 h-3 rounded-full" style={{ backgroundColor: legend?.color || '#94a3b8' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-800 dark:text-slate-100">{ev.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{ev.date} • {legend?.shortCode || '-'} - {legend?.name || 'Sem legenda'}</p>
                            {ev.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Obs: {ev.notes}</p>}
                          </div>
                          <button
                            onClick={() => beginModalEventEdit(ev)}
                            className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black"
                          >
                            {isActiveEdit ? 'EDITANDO' : 'EDITAR'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="max-h-80 overflow-auto space-y-2 pr-1">
                  {lastSelectedDateEvents.length === 0 && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3">
                      Nenhum evento encontrado neste dia.
                    </div>
                  )}
                  {lastSelectedDateEvents.map((ev) => {
                    const legend = legendById.get(ev.legendTypeId);
                    return (
                      <div key={ev.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-start gap-3">
                        <span className="mt-1 inline-block w-3 h-3 rounded-full" style={{ backgroundColor: legend?.color || '#94a3b8' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100">{ev.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{ev.date} • {legend?.shortCode || '-'} - {legend?.name || 'Sem legenda'}</p>
                          {ev.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Obs: {ev.notes}</p>}
                        </div>
                        <button
                          onClick={() => {
                            removeEvent(ev.id);
                            setShowBatchActionModal(false);
                            setBatchActionMode('create');
                          }}
                          className="h-9 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black"
                        >
                          EXCLUIR
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {(Object.keys(eventCountByCategory) as LegendCategory[]).map((category) => (
          <div key={category} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[10px] font-black text-slate-500 uppercase">{category}</p>
            <p className="text-xl font-black text-slate-800 dark:text-zinc-100 mt-1">{eventCountByCategory[category]}</p>
          </div>
        ))}
      </section>

      <footer className="text-[11px] text-slate-500 dark:text-slate-400 text-center pb-2">
        Responsavel: {currentUser?.name || 'Usuario'} • Os dados ficam salvos por unidade e ano no banco de dados.
      </footer>
    </div>
  );
};

export default SchoolCalendarPage;
