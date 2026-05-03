import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import { 
  Plus, Trash2, Save,
  Info, Calendar,
  UtensilsCrossed, X, CheckCircle2,
  Building, ChevronDown, RefreshCw, Utensils, Copy, Check,
  Edit3, Clock, AlertCircle, CalendarDays, AlertTriangle
} from 'lucide-react';
import { MenuDay, MenuItem, Ingredient, User, Enterprise, Role, Plan } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';
import { extractSchoolCalendarOperationalData } from '../utils/schoolCalendar';
import { drawEnterpriseLogoOnPdf } from '../utils/enterpriseBranding';

const DAYS_OF_WEEK: ('SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO')[] = [
  'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'
];
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
type CalendarSlot = {
  week: number;
  dayOfWeek: DayOfWeek;
  date: Date;
  dateKey: string;
};
type MonthlyMenuBackupSlot = {
  sourceDateKey: string;
  dayOfWeek: DayOfWeek;
  items: MenuItem[];
};
type MonthlyMenuBackupPayload = {
  version: 1;
  kind: 'MONTHLY_MENU_BACKUP';
  type: 'ALMOCO' | 'LANCHE';
  sourceMonth: string;
  exportedAt: string;
  slots: MonthlyMenuBackupSlot[];
};
const SHORT_DAY_LABEL: Record<(typeof DAYS_OF_WEEK)[number], string> = {
  SEGUNDA: 'SEG',
  TERCA: 'TER',
  QUARTA: 'QUA',
  QUINTA: 'QUI',
  SEXTA: 'SEX',
  SABADO: 'SAB',
};
const DAY_OF_WEEK_TO_GRID_INDEX: Record<DayOfWeek, number> = {
  SEGUNDA: 0,
  TERCA: 1,
  QUARTA: 2,
  QUINTA: 3,
  SEXTA: 4,
  SABADO: 5,
};
const DAY_KEY_ALIASES: Record<DayOfWeek, string[]> = {
  SEGUNDA: ['SEGUNDA', 'segunda', 'MONDAY', 'monday'],
  TERCA: ['TERCA', 'terça', 'terca', 'TUESDAY', 'tuesday'],
  QUARTA: ['QUARTA', 'quarta', 'WEDNESDAY', 'wednesday'],
  QUINTA: ['QUINTA', 'quinta', 'THURSDAY', 'thursday'],
  SEXTA: ['SEXTA', 'sexta', 'FRIDAY', 'friday'],
  SABADO: ['SABADO', 'sábado', 'sabado', 'SATURDAY', 'saturday'],
};
const WEEK_OPTIONS = [1, 2, 3, 4, 5] as const;
const WEEKDAY_GRID_ORDER: DayOfWeek[] = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA'];
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const getNextMonthKey = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};
const formatMonthLabel = (monthKey: string) => {
  const [year, month] = String(monthKey || '').split('-').map((v) => Number(v));
  if (!year || !month) return 'Mês atual';
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const getDateForWeekAndDay = (monthKey: string, weekIndex: number, dayOfWeek: DayOfWeek): Date | null => {
  const [yearRaw, monthRaw] = String(monthKey || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month || month < 1 || month > 12) return null;

  const firstDay = new Date(year, month - 1, 1);
  const firstWeekdayGridIndex = (firstDay.getDay() + 6) % 7; // SEG=0 ... DOM=6
  const week = Math.max(1, Number(weekIndex || 1));
  const targetGridIndex = DAY_OF_WEEK_TO_GRID_INDEX[dayOfWeek];
  const dayOfMonth = 1 + ((week - 1) * 7) + targetGridIndex - firstWeekdayGridIndex;
  if (dayOfMonth < 1) return null;

  const resolved = new Date(year, month - 1, dayOfMonth);
  return resolved.getMonth() === month - 1 ? resolved : null;
};
const formatDateFullBr = (value: Date | null) => {
  if (!value) return '--';
  return value.toLocaleDateString('pt-BR');
};
const getActiveServiceDaysFromOpeningHours = (openingHours?: Enterprise['openingHours']): DayOfWeek[] => {
  if (!openingHours) return DAYS_OF_WEEK;

  const activeDays = DAYS_OF_WEEK.filter((dayKey) => {
    const matchedAlias = DAY_KEY_ALIASES[dayKey].find((alias) => openingHours[alias]);
    if (!matchedAlias) return false;
    return openingHours[matchedAlias]?.closed !== true;
  });

  return activeDays;
};

const REFERENCE_INGREDIENTS_FALLBACK: Ingredient[] = [
  { id: 'ref_ovo', name: 'Ovo', category: 'Proteínas', unit: 'g', calories: 143, proteins: 12.6, carbs: 1.1, fats: 9.5, fiber: 0, calciumMg: 50, ironMg: 1.8 },
  { id: 'ref_peito_frango', name: 'Peito de Frango', category: 'Proteínas', unit: 'g', calories: 165, proteins: 31, carbs: 0, fats: 3.6, fiber: 0, calciumMg: 15, ironMg: 0.9 },
  { id: 'ref_tilapia', name: 'Tilápia', category: 'Proteínas', unit: 'g', calories: 128, proteins: 26, carbs: 0, fats: 2.7, fiber: 0, calciumMg: 10, ironMg: 0.6 },
  { id: 'ref_sardinha', name: 'Sardinha', category: 'Proteínas', unit: 'g', calories: 208, proteins: 24.6, carbs: 0, fats: 11.5, fiber: 0, calciumMg: 382, ironMg: 2.9 },
  { id: 'ref_carne_magra', name: 'Carne Bovina Magra', category: 'Proteínas', unit: 'g', calories: 170, proteins: 26, carbs: 0, fats: 7, fiber: 0, calciumMg: 12, ironMg: 2.6 },
  { id: 'ref_iogurte', name: 'Iogurte Natural', category: 'Proteínas', unit: 'g', calories: 61, proteins: 3.5, carbs: 4.7, fats: 3.3, fiber: 0, calciumMg: 121, ironMg: 0.1 },
  { id: 'ref_lentilha', name: 'Lentilha', category: 'Proteínas', unit: 'g', calories: 116, proteins: 9, carbs: 20.1, fats: 0.4, fiber: 7.9, calciumMg: 19, ironMg: 3.3 },
  { id: 'ref_arroz_integral', name: 'Arroz Integral', category: 'Carboidratos', unit: 'g', calories: 123, proteins: 2.7, carbs: 25.6, fats: 1, fiber: 1.6, calciumMg: 10, ironMg: 0.4 },
  { id: 'ref_batata_doce', name: 'Batata-Doce', category: 'Carboidratos', unit: 'g', calories: 86, proteins: 1.6, carbs: 20.1, fats: 0.1, fiber: 3, calciumMg: 30, ironMg: 0.6 },
  { id: 'ref_aveia', name: 'Aveia em Flocos', category: 'Carboidratos', unit: 'g', calories: 389, proteins: 16.9, carbs: 66.3, fats: 6.9, fiber: 10.6, calciumMg: 54, ironMg: 4.7 },
  { id: 'ref_milho', name: 'Milho', category: 'Carboidratos', unit: 'g', calories: 96, proteins: 3.4, carbs: 21, fats: 1.5, fiber: 2.4, calciumMg: 2, ironMg: 0.5 },
  { id: 'ref_banana', name: 'Banana', category: 'Carboidratos', unit: 'g', calories: 89, proteins: 1.1, carbs: 22.8, fats: 0.3, fiber: 2.6, calciumMg: 5, ironMg: 0.3 },
  { id: 'ref_mandioca', name: 'Mandioca', category: 'Carboidratos', unit: 'g', calories: 125, proteins: 0.6, carbs: 30.1, fats: 0.3, fiber: 1.8, calciumMg: 17, ironMg: 0.3 },
  { id: 'ref_couve_flor', name: 'Couve-Flor', category: 'Fibras', unit: 'g', calories: 25, proteins: 1.9, carbs: 5, fats: 0.3, fiber: 2, calciumMg: 22, ironMg: 0.4 },
  { id: 'ref_brocolis', name: 'Brócolis', category: 'Fibras', unit: 'g', calories: 34, proteins: 2.8, carbs: 6.6, fats: 0.4, fiber: 2.6, calciumMg: 47, ironMg: 0.7 },
  { id: 'ref_feijao_preto', name: 'Feijão Preto', category: 'Fibras', unit: 'g', calories: 132, proteins: 8.9, carbs: 23.7, fats: 0.5, fiber: 8.7, calciumMg: 27, ironMg: 2.1 },
  { id: 'ref_maca_casca', name: 'Maçã com Casca', category: 'Fibras', unit: 'g', calories: 52, proteins: 0.3, carbs: 13.8, fats: 0.2, fiber: 2.4, calciumMg: 6, ironMg: 0.1 },
  { id: 'ref_chia', name: 'Chia', category: 'Fibras', unit: 'g', calories: 486, proteins: 16.5, carbs: 42.1, fats: 30.7, fiber: 34.4, calciumMg: 631, ironMg: 7.7 },
  { id: 'ref_linhaca', name: 'Linhaça', category: 'Fibras', unit: 'g', calories: 534, proteins: 18.3, carbs: 28.9, fats: 42.2, fiber: 27.3, calciumMg: 255, ironMg: 5.7 },
  { id: 'ref_farelo_trigo', name: 'Farelo de Trigo', category: 'Fibras', unit: 'g', calories: 216, proteins: 15.6, carbs: 64.5, fats: 4.3, fiber: 42.8, calciumMg: 73, ironMg: 10.6 },
  { id: 'ref_leite', name: 'Leite de Vaca', category: 'Cálcio', unit: 'g', calories: 61, proteins: 3.2, carbs: 4.8, fats: 3.3, fiber: 0, calciumMg: 113, ironMg: 0 },
  { id: 'ref_queijo_minas', name: 'Queijo Branco (Minas)', category: 'Cálcio', unit: 'g', calories: 264, proteins: 17.4, carbs: 3.2, fats: 20.2, fiber: 0, calciumMg: 579, ironMg: 0.2 },
  { id: 'ref_gergelim', name: 'Gergelim', category: 'Cálcio', unit: 'g', calories: 573, proteins: 17.7, carbs: 23.5, fats: 49.7, fiber: 11.8, calciumMg: 975, ironMg: 14.6 },
  { id: 'ref_espinafre', name: 'Espinafre', category: 'Cálcio', unit: 'g', calories: 23, proteins: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2, calciumMg: 99, ironMg: 2.7 },
  { id: 'ref_tofu', name: 'Tofu', category: 'Cálcio', unit: 'g', calories: 76, proteins: 8, carbs: 1.9, fats: 4.8, fiber: 0.3, calciumMg: 350, ironMg: 5.4 },
  { id: 'ref_sardinha_cozida', name: 'Sardinha Cozida', category: 'Cálcio', unit: 'g', calories: 208, proteins: 24.6, carbs: 0, fats: 11.5, fiber: 0, calciumMg: 382, ironMg: 2.9 },
  { id: 'ref_figado_boi', name: 'Fígado de Boi', category: 'Ferro', unit: 'g', calories: 135, proteins: 20.4, carbs: 3.9, fats: 3.6, fiber: 0, calciumMg: 5, ironMg: 6.5 },
  { id: 'ref_feijao_carioca', name: 'Feijão Carioca', category: 'Ferro', unit: 'g', calories: 127, proteins: 8.7, carbs: 22.8, fats: 0.5, fiber: 8.5, calciumMg: 28, ironMg: 1.9 },
  { id: 'ref_gema_ovo', name: 'Gema de Ovo', category: 'Ferro', unit: 'g', calories: 322, proteins: 15.9, carbs: 3.6, fats: 26.5, fiber: 0, calciumMg: 129, ironMg: 2.7 },
  { id: 'ref_beterraba', name: 'Beterraba', category: 'Ferro', unit: 'g', calories: 43, proteins: 1.6, carbs: 9.6, fats: 0.2, fiber: 2.8, calciumMg: 16, ironMg: 0.8 },
  { id: 'ref_couve_manteiga', name: 'Couve-Manteiga', category: 'Ferro', unit: 'g', calories: 32, proteins: 2.9, carbs: 5.4, fats: 0.6, fiber: 4.1, calciumMg: 177, ironMg: 0.5 },
  { id: 'ref_grao_bico', name: 'Grão-de-Bico', category: 'Ferro', unit: 'g', calories: 164, proteins: 8.9, carbs: 27.4, fats: 2.6, fiber: 7.6, calciumMg: 49, ironMg: 2.9 },
  { id: 'ref_laranja', name: 'Laranja', category: 'Vitaminas', unit: 'g', calories: 47, proteins: 0.9, carbs: 11.8, fats: 0.1, fiber: 2.4, calciumMg: 40, ironMg: 0.1 },
  { id: 'ref_cenoura', name: 'Cenoura', category: 'Vitaminas', unit: 'g', calories: 41, proteins: 0.9, carbs: 9.6, fats: 0.2, fiber: 2.8, calciumMg: 33, ironMg: 0.3 },
  { id: 'ref_acerola', name: 'Acerola', category: 'Vitaminas', unit: 'g', calories: 32, proteins: 0.4, carbs: 7.7, fats: 0.3, fiber: 1.1, calciumMg: 12, ironMg: 0.2 },
  { id: 'ref_abobora', name: 'Abóbora', category: 'Vitaminas', unit: 'g', calories: 26, proteins: 1, carbs: 6.5, fats: 0.1, fiber: 0.5, calciumMg: 21, ironMg: 0.8 },
  { id: 'ref_mamao', name: 'Mamão', category: 'Vitaminas', unit: 'g', calories: 43, proteins: 0.5, carbs: 10.8, fats: 0.3, fiber: 1.7, calciumMg: 20, ironMg: 0.3 },
  { id: 'ref_pimentao_amarelo', name: 'Pimentão Amarelo', category: 'Vitaminas', unit: 'g', calories: 27, proteins: 1, carbs: 6.3, fats: 0.2, fiber: 0.9, calciumMg: 11, ironMg: 0.5 },
];

const mergeWithFallbackIngredients = (ingredients: Ingredient[]): Ingredient[] => {
  const merged = [...(Array.isArray(ingredients) ? ingredients : [])];
  const known = new Set(merged.map((item) => normalizeSearchText(item.name)));
  REFERENCE_INGREDIENTS_FALLBACK.forEach((item) => {
    const key = normalizeSearchText(item.name);
    if (!known.has(key)) {
      merged.push(item);
      known.add(key);
    }
  });
  return merged;
};

interface MenuManagementPageProps {
  type: 'ALMOCO' | 'LANCHE';
  currentUser: User;
  activeEnterprise: Enterprise | null;
}

const MenuManagementPage: React.FC<MenuManagementPageProps> = ({ type, currentUser, activeEnterprise }) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string>(activeEnterprise?.id || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuLinkCopied, setIsMenuLinkCopied] = useState(false);
  const [ingredientsCatalog, setIngredientsCatalog] = useState<Ingredient[]>([]);
  const [plansCatalog, setPlansCatalog] = useState<Plan[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);

  useEffect(() => {
    if (activeEnterprise?.id) {
      setSelectedUnitId(activeEnterprise.id);
    }
  }, [activeEnterprise?.id]);
  
  // Carregar enterprises da API (para OWNER selecionar unidade)
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const data = await ApiService.getEnterprises();
        setEnterprises(data);
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
        setEnterprises([]);
      }
    };
    loadEnterprises();
  }, []);

  // Carregar catálogo de insumos para autocomplete no editor
  useEffect(() => {
    const loadIngredients = async () => {
      try {
        const data = await ApiService.getIngredients();
        const list = mergeWithFallbackIngredients(Array.isArray(data) ? data : []);
        setIngredientsCatalog(list);
      } catch (err) {
        console.error('Erro ao carregar insumos:', err);
        setIngredientsCatalog(mergeWithFallbackIngredients([]));
      }
    };
    loadIngredients();
  }, []);
  
  // Função para gerar o estado inicial com os 2 planos obrigatórios por dia
  const generateInitialMenu = () => {
    return DAYS_OF_WEEK.map(day => ({ 
      id: Math.random().toString(36).substr(2, 9), 
      dayOfWeek: day, 
      items: [] 
    }));
  };

  const normalizeMenuDays = (rawDays: any[]): MenuDay[] => {
    const list = Array.isArray(rawDays) ? rawDays : [];
    const mapByDay = new Map(
      list
        .filter((d) => d && DAYS_OF_WEEK.includes(d.dayOfWeek))
        .map((d) => [d.dayOfWeek, d])
    );

    return DAYS_OF_WEEK.map((day) => {
      const source = mapByDay.get(day);
      if (!source) {
        return {
          id: Math.random().toString(36).substr(2, 9),
          dayOfWeek: day,
          items: [],
        };
      }
      return {
        id: source.id || Math.random().toString(36).substr(2, 9),
        dayOfWeek: day,
        items: Array.isArray(source.items) ? source.items : [],
      };
    });
  };

  const cloneMenuItems = (items: MenuItem[]): MenuItem[] =>
    (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      id: Math.random().toString(36).substr(2, 9),
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients.map((ing) => ({ ...ing, id: Math.random().toString(36).substr(2, 9) }))
        : [],
    }));

  const cloneMenuItemsPreserveIds = (items: MenuItem[]): MenuItem[] =>
    (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients.map((ing) => ({ ...ing }))
        : [],
    }));

  const mirrorWeekDaysFromWeek2 = (week2Days: MenuDay[], currentWeek5Days: MenuDay[]): MenuDay[] => {
    const normalizedWeek2 = normalizeMenuDays(week2Days || []);
    const normalizedWeek5 = normalizeMenuDays(currentWeek5Days || []);
    return DAYS_OF_WEEK.map((dayKey) => {
      const sourceDay = normalizedWeek2.find((day) => day.dayOfWeek === dayKey);
      const currentDay = normalizedWeek5.find((day) => day.dayOfWeek === dayKey);
      return {
        id: currentDay?.id || sourceDay?.id || Math.random().toString(36).substr(2, 9),
        dayOfWeek: dayKey,
        items: cloneMenuItemsPreserveIds(sourceDay?.items || []),
      };
    });
  };

  const buildInitialWeeklyMenuByWeek = () =>
    WEEK_OPTIONS.reduce((acc, week) => {
      acc[week] = generateInitialMenu();
      return acc;
    }, {} as Record<number, MenuDay[]>);

  const [weeklyMenuByWeek, setWeeklyMenuByWeek] = useState<Record<number, MenuDay[]>>(buildInitialWeeklyMenuByWeek());
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());
  const [schoolCalendarBlockedDates, setSchoolCalendarBlockedDates] = useState<string[]>([]);
  const [schoolCalendarEventByDate, setSchoolCalendarEventByDate] = useState<Record<string, string>>({});
  const [duplicateMonthTarget, setDuplicateMonthTarget] = useState<string>(getNextMonthKey());
  const [pendingMonthlyBackup, setPendingMonthlyBackup] = useState<MonthlyMenuBackupPayload | null>(null);
  const [restoreStartDateKey, setRestoreStartDateKey] = useState<string>('');
  const monthlyBackupInputRef = useRef<HTMLInputElement | null>(null);
  const [dayDuplicateTarget, setDayDuplicateTarget] = useState<{
    sourceWeek: number;
    sourceDayId: string;
    sourceDayOfWeek: DayOfWeek;
    targetWeek: number;
    targetDayOfWeek: DayOfWeek;
  } | null>(null);
  const [dayPlanActionModal, setDayPlanActionModal] = useState<{
    week: number;
    dayId: string;
    mode: 'EDIT' | 'DELETE';
  } | null>(null);

  const isOwner = currentUser.role === Role.OWNER;

  useEffect(() => {
    const loadAllWeeklyMenus = async () => {
      if (!selectedUnitId) {
        setWeeklyMenuByWeek(buildInitialWeeklyMenuByWeek());
        setMenuLoaded(false);
        return;
      }

      setMenuLoaded(false);
      setIsLoading(true);
      try {
        const responses = await Promise.all(
          WEEK_OPTIONS.map(async (week) => {
            const payload = await ApiService.getWeeklyMenu(selectedUnitId, type, week, selectedMonth);
            return [week, normalizeMenuDays(payload?.days || [])] as const;
          })
        );
        const nextMap = responses.reduce((acc, [week, days]) => {
          acc[week] = days;
          return acc;
        }, {} as Record<number, MenuDay[]>);
        setWeeklyMenuByWeek(nextMap);
      } catch (error) {
        console.error('Erro ao carregar cardápio semanal:', error);
        setWeeklyMenuByWeek(buildInitialWeeklyMenuByWeek());
      } finally {
        setMenuLoaded(true);
        setIsLoading(false);
      }
    };

    loadAllWeeklyMenus();
  }, [selectedUnitId, type, selectedMonth]);

  useEffect(() => {
    setWeeklyMenuByWeek((prev) => {
      const week2 = normalizeMenuDays(prev[2] || generateInitialMenu());
      const week5 = normalizeMenuDays(prev[5] || generateInitialMenu());
      const mirroredWeek5 = mirrorWeekDaysFromWeek2(week2, week5);

      const stripComparable = (days: MenuDay[]) => days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        items: day.items || [],
      }));

      const currentComparable = JSON.stringify(stripComparable(week5));
      const mirroredComparable = JSON.stringify(stripComparable(mirroredWeek5));
      if (currentComparable === mirroredComparable) return prev;

      return {
        ...prev,
        5: mirroredWeek5,
      };
    });
  }, [weeklyMenuByWeek[2], weeklyMenuByWeek[5]]);

  useEffect(() => {
    if (!menuLoaded || !selectedUnitId) return;
    const timer = setTimeout(async () => {
      try {
        await Promise.all(
          WEEK_OPTIONS.map((week) =>
            ApiService.saveWeeklyMenu(
              selectedUnitId,
              type,
              weeklyMenuByWeek[week] || generateInitialMenu(),
              week,
              selectedMonth
            )
          )
        );
      } catch (error) {
        console.error('Erro ao salvar cardápio semanal:', error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [weeklyMenuByWeek, selectedUnitId, type, selectedMonth, menuLoaded]);

  const [editingItem, setEditingItem] = useState<{ week: number, dayId: string, item: MenuItem } | null>(null);
  const [quickIngredientQuery, setQuickIngredientQuery] = useState('');
  const [quickIngredientWeight, setQuickIngredientWeight] = useState('100');
  const [quickIngredientGramsEnabled, setQuickIngredientGramsEnabled] = useState(false);
  const [quickIngredientHighlightedIndex, setQuickIngredientHighlightedIndex] = useState(-1);
  const [isQuickIngredientListOpen, setIsQuickIngredientListOpen] = useState(false);
  const [quickIngredientSuggestions, setQuickIngredientSuggestions] = useState<Ingredient[]>([]);
  const [isLoadingQuickIngredientSuggestions, setIsLoadingQuickIngredientSuggestions] = useState(false);
  const [openPlanPickerDayId, setOpenPlanPickerDayId] = useState<string | null>(null);
  const [newItemPlanByDay, setNewItemPlanByDay] = useState<Record<string, string>>({});
  const [ingredientReplicateTargetId, setIngredientReplicateTargetId] = useState<string | null>(null);
  const [ingredientReplicateDays, setIngredientReplicateDays] = useState<(typeof DAYS_OF_WEEK)[number][]>([]);
  const [draggingMenuItem, setDraggingMenuItem] = useState<{ week: number; dayId: string; itemId: string } | null>(null);
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      if (!selectedUnitId) {
        setPlansCatalog([]);
        return;
      }
      try {
        const data = await ApiService.getPlans(selectedUnitId);
        const normalized = (Array.isArray(data) ? data : []).filter((plan: Plan) => plan?.isActive !== false);
        setPlansCatalog(normalized);
      } catch (error) {
        console.error('Erro ao carregar planos para cardápio:', error);
        setPlansCatalog([]);
      }
    };
    loadPlans();
  }, [selectedUnitId]);

  const updateWeekMenu = (week: number, updater: (days: MenuDay[]) => MenuDay[]) => {
    setWeeklyMenuByWeek((prev) => {
      const current = prev[week] || generateInitialMenu();
      return {
        ...prev,
        [week]: updater(current),
      };
    });
  };

  const addItemToDay = (week: number, dayId: string, planId?: string) => {
    const targetDay = (weeklyMenuByWeek[week] || generateInitialMenu()).find((day) => day.id === dayId);
    const targetDate = targetDay ? getDayDateForWeek(week, targetDay.dayOfWeek as DayOfWeek) : null;
    if (!targetDate) {
      notificationService.alerta('Dia indisponível', 'Este dia está bloqueado no calendário escolar (feriado/recesso).');
      return;
    }

    if (plansCatalog.length > 0 && !planId) {
      notificationService.alerta('Plano obrigatório', 'Selecione um plano antes de criar o cardápio.');
      return;
    }
    const selectedPlan = plansCatalog.find((plan) => plan.id === planId);
    const cardapioName = selectedPlan?.name ? selectedPlan.name : 'Nova Opção';
    const newItem: MenuItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: cardapioName,
      description: '',
      price: 0,
      ingredients: [],
      planId: selectedPlan?.id,
    };
    updateWeekMenu(week, (prev) => prev.map(d => d.id === dayId ? { ...d, items: [...d.items, newItem] } : d));
    setEditingItem({ week, dayId, item: newItem });
    setOpenPlanPickerDayId(null);
  };

  const removeItemFromDay = (week: number, dayId: string, itemId: string) => {
    if (window.confirm("Deseja remover este cardápio permanentemente?")) {
      updateWeekMenu(week, (prev) => prev.map(d => d.id === dayId ? { ...d, items: d.items.filter(i => i.id !== itemId) } : d));
    }
  };

  const toggleIngredientReplicatePicker = (ingredientId: string) => {
    if (!editingItem) return;
    if (ingredientReplicateTargetId === ingredientId) {
      setIngredientReplicateTargetId(null);
      setIngredientReplicateDays([]);
      return;
    }
    setIngredientReplicateTargetId(ingredientId);
    const currentDay = (weeklyMenuByWeek[editingItem.week] || []).find((day) => day.id === editingItem.dayId)?.dayOfWeek;
    setIngredientReplicateDays(currentDay ? [currentDay] : []);
  };

  const applyIngredientReplication = () => {
    if (!editingItem || !ingredientReplicateTargetId || ingredientReplicateDays.length === 0) return;

    const sourceIngredient = editingItem.item.ingredients.find((ing) => ing.id === ingredientReplicateTargetId);
    if (!sourceIngredient) return;

    const sourceDay = (weeklyMenuByWeek[editingItem.week] || []).find((day) => day.id === editingItem.dayId);
    if (!sourceDay) return;

    const appliedDays: string[] = [];

    updateWeekMenu(editingItem.week, (prev) => prev.map((day) => {
      if (!ingredientReplicateDays.includes(day.dayOfWeek)) return day;

      const isCurrentDay = day.id === editingItem.dayId;
      const dayItems = [...day.items];

      const targetItemIndex = dayItems.findIndex((item) => {
        const sameName = String(item.name || '').trim().toLowerCase() === String(editingItem.item.name || '').trim().toLowerCase();
        const samePlan = String(item.planId || '') === String(editingItem.item.planId || '');
        return sameName && samePlan;
      });

      if (targetItemIndex >= 0) {
        const targetItem = dayItems[targetItemIndex];
        const ingredientExists = targetItem.ingredients.some(
          (ing) => String(ing.name || '').trim().toLowerCase() === String(sourceIngredient.name || '').trim().toLowerCase()
        );
        if (ingredientExists) {
          if (isCurrentDay) appliedDays.push(day.dayOfWeek);
          return day;
        }
        dayItems[targetItemIndex] = {
          ...targetItem,
          ingredients: [
            ...targetItem.ingredients,
            { ...sourceIngredient, id: Math.random().toString(36).substr(2, 9) },
          ],
        };
      } else {
        dayItems.push({
          ...editingItem.item,
          id: Math.random().toString(36).substr(2, 9),
          ingredients: [{ ...sourceIngredient, id: Math.random().toString(36).substr(2, 9) }],
        });
      }

      appliedDays.push(day.dayOfWeek);
      return { ...day, items: dayItems };
    }));

    if (appliedDays.length > 0) {
      notificationService.informativo(
        'Insumo replicado',
        `Insumo adicionado em: ${appliedDays.map((day) => SHORT_DAY_LABEL[day as keyof typeof SHORT_DAY_LABEL] || day).join(', ')}.`
      );
    }

    setIngredientReplicateTargetId(null);
    setIngredientReplicateDays([]);
  };

  useEffect(() => {
    const term = String(quickIngredientQuery || '').trim();
    if (!editingItem || !term) {
      setQuickIngredientSuggestions([]);
      setIsLoadingQuickIngredientSuggestions(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingQuickIngredientSuggestions(true);
    const normalizedTerm = normalizeSearchText(term);
    const localResults = ingredientsCatalog.filter((item) => {
      const name = normalizeSearchText(String(item.name || ''));
      const category = normalizeSearchText(String(item.category || ''));
      return name.includes(normalizedTerm) || category.includes(normalizedTerm);
    });
    setQuickIngredientSuggestions(localResults);

    const timer = setTimeout(async () => {
      try {
        const results = await ApiService.searchIngredients(term, 300);
        if (!isCancelled) {
          const remoteResults = Array.isArray(results) ? results : [];
          const merged = [...localResults];
          const seen = new Set(merged.map((item) => String(item.id || '')));
          remoteResults.forEach((item) => {
            const id = String(item?.id || '');
            if (!id || seen.has(id)) return;
            seen.add(id);
            merged.push(item);
          });
          setQuickIngredientSuggestions(merged);
        }
      } catch (error) {
        // Mantém resultados locais já exibidos
      } finally {
        if (!isCancelled) {
          setIsLoadingQuickIngredientSuggestions(false);
        }
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [editingItem, quickIngredientQuery, ingredientsCatalog]);

  useEffect(() => {
    if (!editingItem) return;
    const term = String(quickIngredientQuery || '').trim().toLowerCase();
    if (term) return;
    setQuickIngredientSuggestions(
      ingredientsCatalog
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    );
  }, [editingItem, quickIngredientQuery, ingredientsCatalog]);

  useEffect(() => {
    if (!isQuickIngredientListOpen || quickIngredientSuggestions.length === 0) {
      setQuickIngredientHighlightedIndex(-1);
      return;
    }
    setQuickIngredientHighlightedIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= quickIngredientSuggestions.length) return quickIngredientSuggestions.length - 1;
      return prev;
    });
  }, [isQuickIngredientListOpen, quickIngredientSuggestions]);

  const addIngredientFromQuickForm = (catalogIngredient?: Ingredient) => {
    if (!editingItem) return;
    const query = String(quickIngredientQuery || '').trim();
    if (!query) return;

    const normalizedQuery = normalizeSearchText(query);
    const resolvedIngredient = catalogIngredient
      || ingredientsCatalog.find((item) => normalizeSearchText(String(item.name || '')) === normalizedQuery)
      || ingredientsCatalog.find((item) => normalizeSearchText(String(item.name || '')).includes(normalizedQuery))
      || ingredientsCatalog.find((item) => normalizeSearchText(String(item.category || '')).includes(normalizedQuery));

    const weight = quickIngredientGramsEnabled ? Math.max(1, Number(quickIngredientWeight || 0) || 100) : 100;
    const base = resolvedIngredient || {
      id: Math.random().toString(36).substr(2, 9),
      name: query,
      category: 'GERAL',
      unit: 'g' as const,
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0
    };

    const factor = base.unit === 'g' || base.unit === 'ml' ? (weight / 100) : weight;
    const suffix = base.unit === 'un' ? `${weight} un` : `${weight}${base.unit}`;
    const ingredientToAdd: Ingredient = {
      id: Math.random().toString(36).substr(2, 9),
      name: quickIngredientGramsEnabled ? `${base.name} (${suffix})` : base.name,
      sourceIngredientId: resolvedIngredient ? String(resolvedIngredient.id || '').trim() : undefined,
      category: base.category,
      unit: base.unit,
      calories: Number((Number(base.calories || 0) * factor).toFixed(2)),
      proteins: Number((Number(base.proteins || 0) * factor).toFixed(2)),
      carbs: Number((Number(base.carbs || 0) * factor).toFixed(2)),
      fats: Number((Number(base.fats || 0) * factor).toFixed(2)),
    };

    setEditingItem((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        item: {
          ...prev.item,
          ingredients: [...prev.item.ingredients, ingredientToAdd],
        },
      };
    });
    setQuickIngredientQuery('');
    setQuickIngredientWeight('100');
    setQuickIngredientHighlightedIndex(-1);
    setIsQuickIngredientListOpen(false);
    setQuickIngredientSuggestions([]);
  };

  const removeIngredient = (ingId: string) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      item: {
        ...editingItem.item,
        ingredients: editingItem.item.ingredients.filter(ing => ing.id !== ingId)
      }
    });
  };

  const saveEditingItem = () => {
    if (!editingItem) return;
    updateWeekMenu(editingItem.week, (prev) => prev.map(d => 
      d.id === editingItem.dayId 
        ? { ...d, items: d.items.map(i => i.id === editingItem.item.id ? editingItem.item : i) } 
        : d
    ));

    setEditingItem(null);
  };

  const calculateTotalNutrients = (ingredients: Ingredient[]) => {
    return ingredients.reduce((acc, curr) => ({
      calories: acc.calories + Number(curr.calories),
      proteins: acc.proteins + Number(curr.proteins),
      carbs: acc.carbs + Number(curr.carbs),
      fats: acc.fats + Number(curr.fats)
    }), { calories: 0, proteins: 0, carbs: 0, fats: 0 });
  };

  const canSaveFicha = useMemo(() => {
    if (!editingItem) return false;
    return Boolean(editingItem.item.name?.trim()) && editingItem.item.ingredients.length > 0;
  }, [editingItem]);
  const editingDayLabel = useMemo(() => {
    if (!editingItem) return '';
    return (weeklyMenuByWeek[editingItem.week] || []).find((day) => day.id === editingItem.dayId)?.dayOfWeek || '';
  }, [editingItem, weeklyMenuByWeek]);
  const selectedPlanName = useMemo(() => {
    if (!editingItem?.item?.planId) return '';
    return plansCatalog.find((plan) => plan.id === editingItem.item.planId)?.name || '';
  }, [editingItem, plansCatalog]);
  const getDayDateForWeek = (week: number, dayOfWeek: DayOfWeek) => {
    const resolved = getDateForWeekAndDay(selectedMonth, week, dayOfWeek);
    return isSchoolDateAllowed(resolved) ? resolved : null;
  };
  const getExistingDayKeysForWeek = (week: number): DayOfWeek[] => {
    const weekMenu = weeklyMenuByWeek[week] || [];
    return weekMenu
      .map((day) => day.dayOfWeek as DayOfWeek)
      .filter((dayKey) => Boolean(getDayDateForWeek(week, dayKey)));
  };

  const openDayPlanActionModal = (week: number, dayId: string, mode: 'EDIT' | 'DELETE') => {
    const day = (weeklyMenuByWeek[week] || []).find((entry) => entry.id === dayId);
    const items = Array.isArray(day?.items) ? day.items : [];
    if (items.length === 0) {
      notificationService.informativo('Sem cardápio no dia', 'Esse dia ainda não possui planos cadastrados.');
      return;
    }
    if (items.length === 1) {
      const item = items[0];
      if (mode === 'EDIT') {
        setEditingItem({ week, dayId, item });
      } else {
        removeItemFromDay(week, dayId, item.id);
      }
      return;
    }
    setDayPlanActionModal({ week, dayId, mode });
  };

  const PLAN_CARD_COLORS = [
    {
      bg: 'bg-blue-100 dark:bg-blue-900/65',
      border: 'border-blue-400 dark:border-blue-600',
      badge: 'text-blue-800 dark:text-blue-200',
      title: 'text-blue-950 dark:text-blue-100',
      text: 'text-blue-900/80 dark:text-blue-100/90',
      kcal: 'text-blue-700 dark:text-blue-200',
    },
    {
      bg: 'bg-emerald-100 dark:bg-emerald-900/65',
      border: 'border-emerald-400 dark:border-emerald-600',
      badge: 'text-emerald-800 dark:text-emerald-200',
      title: 'text-emerald-950 dark:text-emerald-100',
      text: 'text-emerald-900/80 dark:text-emerald-100/90',
      kcal: 'text-emerald-700 dark:text-emerald-200',
    },
    {
      bg: 'bg-amber-100 dark:bg-amber-900/65',
      border: 'border-amber-400 dark:border-amber-600',
      badge: 'text-amber-800 dark:text-amber-200',
      title: 'text-amber-950 dark:text-amber-100',
      text: 'text-amber-900/80 dark:text-amber-100/90',
      kcal: 'text-amber-700 dark:text-amber-200',
    },
    {
      bg: 'bg-rose-100 dark:bg-rose-900/65',
      border: 'border-rose-400 dark:border-rose-600',
      badge: 'text-rose-800 dark:text-rose-200',
      title: 'text-rose-950 dark:text-rose-100',
      text: 'text-rose-900/80 dark:text-rose-100/90',
      kcal: 'text-rose-700 dark:text-rose-200',
    },
    {
      bg: 'bg-indigo-100 dark:bg-indigo-900/65',
      border: 'border-indigo-400 dark:border-indigo-600',
      badge: 'text-indigo-800 dark:text-indigo-200',
      title: 'text-indigo-950 dark:text-indigo-100',
      text: 'text-indigo-900/80 dark:text-indigo-100/90',
      kcal: 'text-indigo-700 dark:text-indigo-200',
    },
    {
      bg: 'bg-cyan-100 dark:bg-cyan-900/65',
      border: 'border-cyan-400 dark:border-cyan-600',
      badge: 'text-cyan-800 dark:text-cyan-200',
      title: 'text-cyan-950 dark:text-cyan-100',
      text: 'text-cyan-900/80 dark:text-cyan-100/90',
      kcal: 'text-cyan-700 dark:text-cyan-200',
    },
  ] as const;

  const getPlanCardColor = (planId?: string, fallbackName?: string) => {
    if (!plansCatalog.length) return PLAN_CARD_COLORS[0];
    let index = -1;
    if (planId) {
      index = plansCatalog.findIndex((plan) => plan.id === planId);
    }
    if (index < 0) {
      const key = String(fallbackName || 'PLANO').toUpperCase();
      const hash = key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      index = hash % plansCatalog.length;
    }
    return PLAN_CARD_COLORS[index % PLAN_CARD_COLORS.length];
  };

  const handleDropMenuItem = (targetWeek: number, targetDayId: string) => {
    if (!draggingMenuItem) return;
    if (draggingMenuItem.week === targetWeek && draggingMenuItem.dayId === targetDayId) {
      setDraggingMenuItem(null);
      setDragOverDayKey(null);
      return;
    }

    setWeeklyMenuByWeek((prev) => {
      const sourceWeekDays = (prev[draggingMenuItem.week] || generateInitialMenu()).map((day) => ({
        ...day,
        items: [...day.items],
      }));
      const targetWeekDays = draggingMenuItem.week === targetWeek
        ? sourceWeekDays
        : (prev[targetWeek] || generateInitialMenu()).map((day) => ({
            ...day,
            items: [...day.items],
          }));

      const sourceDayIndex = sourceWeekDays.findIndex((day) => day.id === draggingMenuItem.dayId);
      const targetDayIndex = targetWeekDays.findIndex((day) => day.id === targetDayId);
      if (sourceDayIndex < 0 || targetDayIndex < 0) return prev;

      const sourceItems = sourceWeekDays[sourceDayIndex].items;
      const sourceItemIndex = sourceItems.findIndex((item) => item.id === draggingMenuItem.itemId);
      if (sourceItemIndex < 0) return prev;

      const [movedItem] = sourceItems.splice(sourceItemIndex, 1);
      targetWeekDays[targetDayIndex].items.push(movedItem);

      return {
        ...prev,
        [draggingMenuItem.week]: sourceWeekDays,
        [targetWeek]: targetWeekDays,
      };
    });

    setDraggingMenuItem(null);
    setDragOverDayKey(null);
  };

  const selectedEnterprise = useMemo(() => {
    return enterprises.find((ent) => ent.id === selectedUnitId)
      || (activeEnterprise?.id === selectedUnitId ? activeEnterprise : null)
      || activeEnterprise
      || null;
  }, [enterprises, selectedUnitId, activeEnterprise]);

  const activeServiceDays = useMemo(() => {
    return getActiveServiceDaysFromOpeningHours(selectedEnterprise?.openingHours);
  }, [selectedEnterprise]);

  useEffect(() => {
    const enterpriseId = String(selectedUnitId || '').trim();
    const [yearRaw] = String(selectedMonth || '').split('-');
    const schoolYear = Number(yearRaw);

    if (!enterpriseId || !Number.isFinite(schoolYear)) {
      setSchoolCalendarBlockedDates([]);
      return;
    }

    let cancelled = false;

    const loadSchoolCalendar = async () => {
      try {
        const payload = await ApiService.getSchoolCalendar(enterpriseId, schoolYear);
        if (cancelled) return;

        const extracted = extractSchoolCalendarOperationalData(payload, schoolYear);
        const blockedDates = extracted.blockedDates;
        const eventTitles = extracted.eventTitlesByDate;

        setSchoolCalendarBlockedDates(blockedDates);
        setSchoolCalendarEventByDate(eventTitles);
      } catch (error) {
        console.error('Erro ao carregar calendário escolar (cardápio):', error);
        if (!cancelled) {
          setSchoolCalendarBlockedDates([]);
          setSchoolCalendarEventByDate({});
        }
      }
    };

    void loadSchoolCalendar();

    return () => {
      cancelled = true;
    };
  }, [selectedUnitId, selectedMonth]);

  const activeServiceDaySet = useMemo(() => new Set(activeServiceDays), [activeServiceDays]);
  const schoolCalendarBlockedDateSet = useMemo(() => new Set(schoolCalendarBlockedDates), [schoolCalendarBlockedDates]);
  const isSchoolDateAllowed = (date: Date | null) => {
    if (!date) return false;
    const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    return !schoolCalendarBlockedDateSet.has(key);
  };

  const getSchoolEventTitle = (date: Date | null): string | null => {
    if (!date) return null;
    const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    return schoolCalendarEventByDate[key] || null;
  };

  const selectedEnterpriseName = selectedEnterprise?.name || 'Unidade';

  const copyMenuLinkToClipboard = async () => {
    const enterpriseId = String(selectedUnitId || activeEnterprise?.id || '').trim();
    if (!enterpriseId) {
      notificationService.alerta('Unidade não selecionada', 'Selecione uma unidade antes de copiar o link do cardápio.');
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}#/menu-calendar?enterprise=${enterpriseId}`;
    try {
      await navigator.clipboard.writeText(url);
      setIsMenuLinkCopied(true);
      notificationService.informativo('Copiado!', 'Link do cardápio copiado para a área de transferência.');
      window.setTimeout(() => setIsMenuLinkCopied(false), 2200);
    } catch {
      notificationService.alerta('Falha ao copiar', 'Não foi possível copiar automaticamente. Copie manualmente o link exibido.');
      window.prompt('Copie o link do cardápio:', url);
    }
  };

  const getOpenCalendarSlots = (monthKey: string): CalendarSlot[] => {
    const slots: CalendarSlot[] = [];
    WEEK_OPTIONS.forEach((week) => {
      DAYS_OF_WEEK.forEach((dayOfWeek) => {
        if (!activeServiceDaySet.has(dayOfWeek)) return;
        const date = getDateForWeekAndDay(monthKey, week, dayOfWeek);
        if (!date || !isSchoolDateAllowed(date)) return;
        const dateKey = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
        slots.push({ week, dayOfWeek, date, dateKey });
      });
    });

    slots.sort((a, b) => a.date.getTime() - b.date.getTime());
    return slots;
  };

  const restoreOpenSlots = useMemo(() => getOpenCalendarSlots(selectedMonth), [selectedMonth, activeServiceDaySet, schoolCalendarBlockedDateSet, weeklyMenuByWeek]);

  const triggerMonthlyBackupRestorePicker = () => {
    monthlyBackupInputRef.current?.click();
  };

  const backupMonthlyMenuLocal = () => {
    const sourceSlots = getOpenCalendarSlots(selectedMonth);
    if (sourceSlots.length === 0) {
      notificationService.alerta('Sem dias válidos', 'Não há dias letivos abertos para gerar backup deste mês.');
      return;
    }

    const slots: MonthlyMenuBackupSlot[] = sourceSlots.map((slot) => {
      const day = (weeklyMenuByWeek[slot.week] || []).find((item) => item.dayOfWeek === slot.dayOfWeek);
      return {
        sourceDateKey: slot.dateKey,
        dayOfWeek: slot.dayOfWeek,
        items: cloneMenuItems(day?.items || []),
      };
    });

    const payload: MonthlyMenuBackupPayload = {
      version: 1,
      kind: 'MONTHLY_MENU_BACKUP',
      type,
      sourceMonth: selectedMonth,
      exportedAt: new Date().toISOString(),
      slots,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const fileName = `backup-cardapio-${type.toLowerCase()}-${selectedMonth}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    notificationService.informativo('Backup gerado', `Arquivo ${fileName} pronto para download.`);
  };

  const handleMonthlyBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (String(parsed?.kind || '') !== 'MONTHLY_MENU_BACKUP' || Number(parsed?.version) !== 1) {
        notificationService.alerta('Arquivo inválido', 'Este arquivo não é um backup de cardápio válido.');
        return;
      }

      const slotsRaw = Array.isArray(parsed?.slots) ? parsed.slots : [];
      if (slotsRaw.length === 0) {
        notificationService.alerta('Backup vazio', 'O arquivo não possui itens para restaurar.');
        return;
      }

      const normalizedSlots: MonthlyMenuBackupSlot[] = slotsRaw.map((slot: any) => ({
        sourceDateKey: String(slot?.sourceDateKey || '').trim(),
        dayOfWeek: String(slot?.dayOfWeek || 'SEGUNDA') as DayOfWeek,
        items: Array.isArray(slot?.items) ? slot.items : [],
      }));

      const payload: MonthlyMenuBackupPayload = {
        version: 1,
        kind: 'MONTHLY_MENU_BACKUP',
        type: String(parsed?.type || type).toUpperCase() === 'LANCHE' ? 'LANCHE' : 'ALMOCO',
        sourceMonth: String(parsed?.sourceMonth || ''),
        exportedAt: String(parsed?.exportedAt || ''),
        slots: normalizedSlots,
      };

      const openSlots = getOpenCalendarSlots(selectedMonth);
      if (openSlots.length === 0) {
        notificationService.alerta('Sem dias abertos', 'Não existem dias letivos abertos para restaurar neste mês.');
        return;
      }

      setPendingMonthlyBackup(payload);
      setRestoreStartDateKey(openSlots[0].dateKey);
      notificationService.informativo('Backup carregado', 'Escolha o primeiro dia para começar a restauração do cardápio.');
    } catch (error) {
      notificationService.alerta('Erro ao ler backup', 'Não foi possível processar o arquivo selecionado.');
    }
  };

  const cancelMonthlyRestore = () => {
    setPendingMonthlyBackup(null);
    setRestoreStartDateKey('');
  };

  const applyMonthlyRestore = async () => {
    if (!pendingMonthlyBackup) return;

    const targetSlots = getOpenCalendarSlots(selectedMonth);
    const startIndex = targetSlots.findIndex((slot) => slot.dateKey === restoreStartDateKey);
    if (startIndex < 0) {
      notificationService.alerta('Dia inicial inválido', 'Selecione um dia letivo aberto para iniciar a restauração.');
      return;
    }

    const destinationSlots = targetSlots.slice(startIndex);
    if (destinationSlots.length === 0) {
      notificationService.alerta('Sem espaço no mês', 'Não há dias disponíveis a partir do dia selecionado.');
      return;
    }

    const backupSlots = pendingMonthlyBackup.slots;
    const applyCount = Math.min(backupSlots.length, destinationSlots.length);

    setWeeklyMenuByWeek((prev) => {
      const next = { ...prev } as Record<number, MenuDay[]>;
      WEEK_OPTIONS.forEach((week) => {
        next[week] = (prev[week] || generateInitialMenu()).map((day) => ({ ...day, items: [...day.items] }));
      });

      for (let index = 0; index < applyCount; index += 1) {
        const backupSlot = backupSlots[index];
        const destination = destinationSlots[index];
        const weekDays = next[destination.week] || [];
        const dayIndex = weekDays.findIndex((day) => day.dayOfWeek === destination.dayOfWeek);
        if (dayIndex < 0) continue;
        weekDays[dayIndex] = {
          ...weekDays[dayIndex],
          items: cloneMenuItems(Array.isArray(backupSlot?.items) ? backupSlot.items : []),
        };
      }

      return next;
    });

    if (applyCount < backupSlots.length) {
      notificationService.alerta(
        'Restauração parcial',
        `Foram restaurados ${applyCount} de ${backupSlots.length} dias. O restante não coube no mês selecionado.`
      );
    } else {
      notificationService.informativo('Restauração concluída', `${applyCount} dias do cardápio foram restaurados com sucesso.`);
    }

    setPendingMonthlyBackup(null);
    setRestoreStartDateKey('');
  };

  const toggleDayDuplicatePicker = (week: number, day: MenuDay) => {
    const isSameTarget = dayDuplicateTarget?.sourceDayId === day.id;
    if (isSameTarget) {
      setDayDuplicateTarget(null);
      return;
    }
    const dayIndex = DAYS_OF_WEEK.findIndex((key) => key === day.dayOfWeek);
    const suggestedDay = DAYS_OF_WEEK[(dayIndex + 1 + DAYS_OF_WEEK.length) % DAYS_OF_WEEK.length];
    setDayDuplicateTarget({
      sourceWeek: week,
      sourceDayId: day.id,
      sourceDayOfWeek: day.dayOfWeek as DayOfWeek,
      targetWeek: week,
      targetDayOfWeek: suggestedDay,
    });
  };

  const applyDayDuplication = async () => {
    if (!dayDuplicateTarget || !selectedUnitId) return;

    const { sourceWeek, sourceDayId, sourceDayOfWeek, targetWeek, targetDayOfWeek } = dayDuplicateTarget;
    if (targetWeek === sourceWeek && targetDayOfWeek === sourceDayOfWeek) {
      notificationService.alerta('Destino inválido', 'Selecione uma semana/dia diferente da origem.');
      return;
    }

    const sourceDay = (weeklyMenuByWeek[sourceWeek] || []).find((day) => day.id === sourceDayId);
    if (!sourceDay) {
      notificationService.alerta('Origem não encontrada', 'Não foi possível localizar o dia de origem.');
      return;
    }

    setIsLoading(true);
    try {
      if (targetWeek === sourceWeek) {
        updateWeekMenu(targetWeek, (prev) =>
          prev.map((day) =>
            day.dayOfWeek === targetDayOfWeek
              ? { ...day, items: cloneMenuItems(sourceDay.items) }
              : day
          )
        );
      } else {
        const targetWeekDays = (weeklyMenuByWeek[targetWeek] || generateInitialMenu());
        const nextDays = targetWeekDays.map((day) =>
          day.dayOfWeek === targetDayOfWeek
            ? { ...day, items: cloneMenuItems(sourceDay.items) }
            : day
        );
        setWeeklyMenuByWeek((prev) => ({ ...prev, [targetWeek]: nextDays }));
        await ApiService.saveWeeklyMenu(selectedUnitId, type, nextDays, targetWeek, selectedMonth);
      }

      notificationService.informativo(
        'Dia duplicado',
        `Cardápio de ${SHORT_DAY_LABEL[sourceDayOfWeek]} copiado para ${targetWeek}ª semana • ${SHORT_DAY_LABEL[targetDayOfWeek]}.`
      );
      setDayDuplicateTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao duplicar dia do cardápio.';
      notificationService.alerta('Erro ao duplicar dia', message);
    } finally {
      setIsLoading(false);
    }
  };

  const duplicateToMonth = async () => {
    if (!selectedUnitId) return;
    const targetMonth = String(duplicateMonthTarget || '').trim();
    if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      notificationService.alerta('Mês inválido', 'Use o formato AAAA-MM.');
      return;
    }
    if (targetMonth === selectedMonth) {
      notificationService.alerta('Mês igual', 'Selecione um mês diferente para duplicar.');
      return;
    }
    setIsLoading(true);
    try {
      for (const week of WEEK_OPTIONS) {
        const source = await ApiService.getWeeklyMenu(selectedUnitId, type, week, selectedMonth);
        const days = Array.isArray(source?.days) ? source.days : generateInitialMenu();
        await ApiService.saveWeeklyMenu(selectedUnitId, type, days, week, targetMonth);
      }
      notificationService.informativo('Duplicação concluída', `Dados duplicados para ${formatMonthLabel(targetMonth)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao duplicar dados do cardápio.';
      notificationService.alerta('Erro ao duplicar', message);
    } finally {
      setIsLoading(false);
    }
  };

  const exportWeeklyCalendarPdf = () => {
    try {
      const isCompactMode = true;
      const [yearRaw, monthRaw] = String(selectedMonth || '').split('-');
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      if (!year || !month || month < 1 || month > 12) {
        notificationService.alerta('Mês inválido', 'Selecione um mês válido antes de exportar.');
        return;
      }

    type CalendarDayCard = {
      week: number;
      dayOfWeek: DayOfWeek;
      date: Date | null;
      items: MenuItem[];
    };

      if (activeServiceDays.length === 0) {
      notificationService.alerta('Sem dias ativos', 'Nenhum dia de atendimento está ativo em Ajustes > Atendimento.');
      return;
    }

      const exportServiceDays = activeServiceDays.length > 0 ? activeServiceDays : DAYS_OF_WEEK;

      const buildCalendarRows = (planFilterId?: string): CalendarDayCard[][] => WEEK_OPTIONS.map((week) => {
      const weekDays = weeklyMenuByWeek[week] || [];
        return exportServiceDays.map((dayOfWeek) => {
        const matchedDay = weekDays.find((day) => day.dayOfWeek === dayOfWeek);
        const allItems = Array.isArray(matchedDay?.items) ? matchedDay!.items : [];
        const filteredItems = !planFilterId
          ? allItems
          : allItems.filter((item) => String(item?.planId || '') === String(planFilterId));
        return {
          week,
          dayOfWeek,
          date: getDayDateForWeek(week, dayOfWeek),
          items: filteredItems,
        };
      });
    }).filter((row) => row.some((cell) => Boolean(cell.date)));

      const calendarRows = buildCalendarRows();

      const hasAnyPlan = calendarRows.some((row) => row.some((cell) => cell.date && cell.items.length > 0));
      if (!hasAnyPlan) {
        notificationService.informativo('Exportação sem itens', 'Este mês ainda não possui planos cadastrados. O PDF será gerado com a grade vazia.');
      }

    // Helper function to format date to YYYY-MM-DD
    const formatDateKey = (date: Date): string => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedAt = new Date();
    const planNameById = new Map(plansCatalog.map((plan) => [plan.id, plan.name]));
    const planPages = (() => {
      const pages = new Map<string, { planId: string; planName: string }>();
      (Object.values(weeklyMenuByWeek) as MenuDay[][]).forEach((days) => {
        (days || []).forEach((day) => {
          (day.items || []).forEach((item) => {
            const planId = String(item?.planId || '').trim();
            if (!planId) return;
            if (!pages.has(planId)) {
              pages.set(planId, {
                planId,
                planName: String(planNameById.get(planId) || item.name || 'Cardápio'),
              });
            }
          });
        });
      });
      if (pages.size === 0) {
        return [{ planId: '', planName: type === 'ALMOCO' ? 'Cardápio de Almoço' : 'Cardápio de Lanche' }];
      }
      return Array.from(pages.values());
    })();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const tableStartY = isCompactMode ? 31 : 34;
    const bottomMargin = isCompactMode ? 6 : 8;
    const tableWidth = pageWidth - marginX * 2;
    const contentAreaHeight = pageHeight - tableStartY - bottomMargin;
    const colHeaderH = isCompactMode ? 9 : 10;
    const weekSideW = isCompactMode ? 12 : 0;
    const colCount = exportServiceDays.length;
    const dayColumnsWidth = tableWidth - weekSideW;
    const colW = dayColumnsWidth / colCount;
    const maxWeeksPerPage = Math.max(1, Math.min(isCompactMode ? 4 : 3, calendarRows.length));

    const weekdayColor: Record<DayOfWeek, [number, number, number]> = {
      SEGUNDA: [37, 99, 235],
      TERCA: [79, 70, 229],
      QUARTA: [16, 185, 129],
      QUINTA: [245, 158, 11],
      SEXTA: [236, 72, 153],
      SABADO: [14, 165, 233],
    };

    const pdfPlanColors = [
      { bg: [239, 246, 255] as [number, number, number], border: [147, 197, 253] as [number, number, number], text: [30, 64, 175] as [number, number, number] },
      { bg: [236, 253, 245] as [number, number, number], border: [110, 231, 183] as [number, number, number], text: [6, 95, 70] as [number, number, number] },
      { bg: [255, 251, 235] as [number, number, number], border: [252, 211, 77] as [number, number, number], text: [146, 64, 14] as [number, number, number] },
      { bg: [253, 242, 248] as [number, number, number], border: [244, 114, 182] as [number, number, number], text: [157, 23, 77] as [number, number, number] },
      { bg: [245, 243, 255] as [number, number, number], border: [167, 139, 250] as [number, number, number], text: [91, 33, 182] as [number, number, number] },
      { bg: [236, 254, 255] as [number, number, number], border: [103, 232, 249] as [number, number, number], text: [14, 116, 144] as [number, number, number] },
    ];

    const getPdfPlanPalette = (item: MenuItem, index: number) => {
      if (item.planId) {
        const planIndex = plansCatalog.findIndex((plan) => plan.id === item.planId);
        if (planIndex >= 0) return pdfPlanColors[planIndex % pdfPlanColors.length];
      }
      return pdfPlanColors[index % pdfPlanColors.length];
    };

    const drawPageHeader = (planTitle: string) => {
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 16, 'F');

      drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), 11.5, 4.2, 8.5, 'CA');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.2);
      doc.text('CALENDARIO ESCOLAR - CARDAPIO MENSAL', 23, 8.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.text(String(selectedEnterpriseName || 'UNIDADE').toUpperCase(), 23, 12.2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.4);
      doc.text(String(planTitle || 'CARDAPIO').toUpperCase(), pageWidth / 2, 11.2, { align: 'center' });

      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.text(
        `${formatMonthLabel(selectedMonth)}  •  Unidade: ${selectedEnterpriseName}  •  Refeicao: ${type === 'ALMOCO' ? 'Almoco' : 'Lanche'}`,
        11,
        23.2
      );
      doc.setFontSize(7.8);
      doc.text(
        `Gerado em ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`,
        pageWidth - 67,
        23.2
      );

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.35);
      doc.line(10, 27.4, pageWidth - 10, 27.4);
    };

    const getPlanItems = (item: MenuItem) => (
      (item.ingredients?.length || 0) > 0
        ? item.ingredients.map((ing) => String(ing.name || ''))
        : [String(item.description || 'Sem insumos definidos')]
    );

    const wrapPdfBulletText = (value: string, maxWidth: number, maxLines = 2) => {
      const raw = String(value || '').trim() || '-';
      const lines = doc.splitTextToSize(`• ${raw}`, maxWidth) as string[];
      if (lines.length <= maxLines) return lines;

      const clipped = lines.slice(0, maxLines);
      let last = String(clipped[maxLines - 1] || '').trim();
      while (last.length > 0 && doc.getTextWidth(`${last}...`) > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      clipped[maxLines - 1] = `${last}...`;
      return clipped;
    };

    const drawVerticalStackedText = (text: string, centerX: number, topY: number, areaHeight: number) => {
      const chars = String(text || '')
        .toUpperCase()
        .split('');
      const visibleChars = chars.filter((char) => char !== ' ');
      const availableHeight = Math.max(10, areaHeight - 3);
      const step = Math.min(2.15, availableHeight / Math.max(1, visibleChars.length + 1));
      const fontSize = Math.max(4.5, Math.min(5.1, step * 1.1));
      const totalHeight = visibleChars.length * step;
      let cursorY = topY + (areaHeight - totalHeight) / 2 + step * 0.2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      chars.forEach((char) => {
        if (char !== ' ') {
          doc.text(char, centerX, cursorY, { align: 'center' });
          cursorY += step;
        }
      });
    };

    const drawTableColumnHeaders = (startY: number) => {
      if (weekSideW > 0) {
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, startY, weekSideW, colHeaderH, 'F');
      }

      exportServiceDays.forEach((day, i) => {
        const cx = marginX + weekSideW + i * colW;
        const accent = weekdayColor[day] || [79, 70, 229];
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx + 0.5, startY + 0.6, colW - 1, colHeaderH - 1.2, 1, 1, 'F');
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.roundedRect(cx + 0.8, startY + 0.9, colW - 1.6, 1.2, 0.4, 0.4, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(day, cx + colW / 2, startY + 6.8, { align: 'center' });
      });
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.rect(marginX, startY, tableWidth, colHeaderH);
      if (weekSideW > 0) {
        doc.line(marginX + weekSideW, startY, marginX + weekSideW, startY + colHeaderH);
      }
      for (let i = 1; i < colCount; i += 1) {
        const lx = marginX + weekSideW + i * colW;
        doc.line(lx, startY, lx, startY + colHeaderH);
      }
    };

    const drawTableGrid = (startY: number, rowHeights: number[]) => {
      const totalH = rowHeights.reduce((a, b) => a + b, 0);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.rect(marginX, startY, tableWidth, totalH);
      let rCursorY = startY;
      for (let r = 0; r < rowHeights.length - 1; r += 1) {
        rCursorY += rowHeights[r];
        doc.line(marginX, rCursorY, marginX + tableWidth, rCursorY);
      }
      if (weekSideW > 0) {
        doc.line(marginX + weekSideW, startY, marginX + weekSideW, startY + totalH);
      }
      for (let c = 1; c < colCount; c += 1) {
        const lx = marginX + weekSideW + c * colW;
        doc.line(lx, startY, lx, startY + totalH);
      }
    };

    const cellPaddingTop = isCompactMode ? 7 : 9;
    const titleFontSize = isCompactMode ? 4.9 : 5.9;
    const bodyFontSize = isCompactMode ? 5 : 6.2;
    const titleLineHeight = isCompactMode ? 2.1 : 2.8;
    const itemLineHeight = isCompactMode ? 1.9 : 2.9;
    const itemColumnGap = 1.4;

    const calcCellNaturalHeight = (
      entry: CalendarDayCard,
      state: { planIndex: number; itemOffset: number }
    ): number => {
      if (!entry.date || entry.items.length === 0) return cellPaddingTop + 4;
      const itemColumnWidth = isCompactMode ? (colW - 4) : (colW - 5 - itemColumnGap) / 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleFontSize);
      let lineY = cellPaddingTop + 1.6;
      let currentPlanIndex = state.planIndex;
      let currentItemOffset = state.itemOffset;
      while (currentPlanIndex < entry.items.length) {
        const item = entry.items[currentPlanIndex];
        const planName = item.planId
          ? (planNameById.get(item.planId) || item.name || `Plano ${currentPlanIndex + 1}`)
          : (item.name || `Plano ${currentPlanIndex + 1}`);
        const titleLabel = `${currentPlanIndex + 1}. ${String(planName)}`;
        const wrappedPlan = doc.splitTextToSize(titleLabel, colW - 5).slice(0, 2);
        const planItems = getPlanItems(item);
        const remainingItems = planItems.slice(currentItemOffset);
        const titleHeight = wrappedPlan.length * titleLineHeight;
        let renderedRowsHeight = 0;
        if (isCompactMode) {
          for (let idx = 0; idx < remainingItems.length; idx += 1) {
            const lineCount = wrapPdfBulletText(String(remainingItems[idx] || ''), itemColumnWidth, 1).length || 1;
            renderedRowsHeight += lineCount * itemLineHeight;
          }
        } else {
          for (let idx = 0; idx < remainingItems.length; idx += 2) {
            const leftText = String(remainingItems[idx] || '');
            const rightText = String(remainingItems[idx + 1] || '');
            const leftLines = leftText ? wrapPdfBulletText(leftText, itemColumnWidth, 2).length : 0;
            const rightLines = rightText ? wrapPdfBulletText(rightText, itemColumnWidth, 2).length : 0;
            const rowLines = Math.max(leftLines, rightLines, 1);
            renderedRowsHeight += rowLines * itemLineHeight;
          }
        }
        const blockHeight = 2.3 + titleHeight + renderedRowsHeight + 0.8;
        lineY += blockHeight + 0.35;
        if (currentPlanIndex + 1 < entry.items.length) lineY += 0.45;
        currentPlanIndex += 1;
        currentItemOffset = 0;
      }
      return lineY + 1.5;
    };

    const drawCalendarCellTable = (
      entry: CalendarDayCard,
      weekNum: number,
      isFirstCell: boolean,
      x: number,
      y: number,
      w: number,
      h: number,
      state: { planIndex: number; itemOffset: number },
      eventsByDate: Record<string, string>
    ) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, h, 'F');

      if (!entry.date) {
        doc.setFillColor(248, 250, 252);
        doc.rect(x, y, w, h, 'F');
        return state;
      }

      const accent = weekdayColor[entry.dayOfWeek] || [79, 70, 229];
      const dateKey = formatDateKey(entry.date);
      const eventTitle = eventsByDate[dateKey];

      if (!isCompactMode && isFirstCell) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.2);
        doc.text(`${weekNum}ª SEM`, x + 1.5, y + 3.8);
      }

      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.roundedRect(x + w - 10.5, y + 1.6, 9, 5.8, 1.1, 1.1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.text(String(entry.date.getDate()).padStart(2, '0'), x + w - 6, y + 5.9, { align: 'center' });

      // Display event/holiday title if exists
      if (eventTitle) {
        doc.setTextColor(219, 39, 119);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.2);
        const eventLabel = eventTitle.length > 12 ? `${eventTitle.substring(0, 11)}...` : eventTitle;
        doc.text(eventLabel, x + w - 10.5, y + 8.6, { align: 'center', maxWidth: 8 });
      }

      doc.setDrawColor(accent[0], accent[1], accent[2]);
      doc.setLineWidth(0.4);
      doc.line(x, y + cellPaddingTop, x + w, y + cellPaddingTop);

      const contentBottom = y + h - 1;
      
      // If no items, show event/holiday centered in empty cell
      if (entry.items.length === 0) {
        if (eventTitle) {
          // Draw centered box with event title
          const eventBoxHeight = 12;
          const eventBoxY = y + cellPaddingTop + (contentBottom - (y + cellPaddingTop) - eventBoxHeight) / 2;
          
          doc.setFillColor(254, 243, 245);
          doc.roundedRect(x + 1, eventBoxY, w - 2, eventBoxHeight, 1, 1, 'F');
          
          doc.setDrawColor(219, 39, 119);
          doc.setLineWidth(0.5);
          doc.roundedRect(x + 1, eventBoxY, w - 2, eventBoxHeight, 1, 1, 'D');
          
          doc.setTextColor(219, 39, 119);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          
          const wrappedEvent = doc.splitTextToSize(eventTitle, w - 4).slice(0, 2);
          let eventY = eventBoxY + 2;
          wrappedEvent.forEach((line: string) => {
            doc.text(line, x + w / 2, eventY, { align: 'center' });
            eventY += 4;
          });
        }
        return state;
      }

      const itemColumnWidth = isCompactMode ? (w - 4) : (w - 5 - itemColumnGap) / 2;
      let lineY = y + cellPaddingTop + 1.2;
      let currentPlanIndex = state.planIndex;
      let currentItemOffset = state.itemOffset;

      while (currentPlanIndex < entry.items.length) {
        const item = entry.items[currentPlanIndex];
        const palette = getPdfPlanPalette(item, currentPlanIndex);
        const planName = item.planId
          ? (planNameById.get(item.planId) || item.name || `Plano ${currentPlanIndex + 1}`)
          : (item.name || `Plano ${currentPlanIndex + 1}`);
        const titleLabel = `${currentPlanIndex + 1}. ${String(planName)}${currentItemOffset > 0 ? ' (cont.)' : ''}`;
        const wrappedPlan = doc.splitTextToSize(titleLabel, w - 5).slice(0, 2);
        const planItems = getPlanItems(item);
        const remainingItems = planItems.slice(currentItemOffset);
        const titleHeight = wrappedPlan.length * titleLineHeight;
        const availableItemsHeight = contentBottom - lineY - titleHeight - 4.2;
        const rowsThatFit = Math.floor(availableItemsHeight / itemLineHeight);

        if (rowsThatFit <= 0) {
          break;
        }

        let rowsHeight = 0;
        let consumedItems = 0;
        const renderedRows: Array<{ left: string[]; right: string[]; rowHeight: number }> = [];

        if (isCompactMode) {
          for (let idx = 0; idx < remainingItems.length; idx += 1) {
            const text = String(remainingItems[idx] || '');
            const lines = text ? wrapPdfBulletText(text, itemColumnWidth, 1) : [];
            const rowHeight = Math.max(1, lines.length) * itemLineHeight;
            if (rowsHeight + rowHeight > availableItemsHeight) break;
            renderedRows.push({ left: lines, right: [], rowHeight });
            rowsHeight += rowHeight;
            consumedItems += text ? 1 : 0;
          }
        } else {
          for (let idx = 0; idx < remainingItems.length; idx += 2) {
            const leftText = String(remainingItems[idx] || '');
            const rightText = String(remainingItems[idx + 1] || '');
            const leftLines = leftText ? wrapPdfBulletText(leftText, itemColumnWidth, 2) : [];
            const rightLines = rightText ? wrapPdfBulletText(rightText, itemColumnWidth, 2) : [];
            const rowLineCount = Math.max(leftLines.length, rightLines.length, 1);
            const rowHeight = rowLineCount * itemLineHeight;

            if (rowsHeight + rowHeight > availableItemsHeight) {
              break;
            }

            renderedRows.push({ left: leftLines, right: rightLines, rowHeight });
            rowsHeight += rowHeight;
            consumedItems += leftText ? 1 : 0;
            consumedItems += rightText ? 1 : 0;
          }
        }

        const itemsToRenderCount = consumedItems;
        const naturalBlockHeight = 2.1 + titleHeight + rowsHeight + 0.6;
        const isLastVisibleCompactBlock = isCompactMode
          && currentPlanIndex === entry.items.length - 1
          && currentItemOffset + itemsToRenderCount >= planItems.length;
        const blockHeight = isLastVisibleCompactBlock
          ? Math.max(naturalBlockHeight, contentBottom - lineY - 0.2)
          : naturalBlockHeight;

        if ((lineY + blockHeight) > contentBottom) {
          break;
        }

        doc.setFillColor(palette.bg[0], palette.bg[1], palette.bg[2]);
        doc.setDrawColor(palette.border[0], palette.border[1], palette.border[2]);
        doc.roundedRect(x + 1, lineY - 0.7, w - 2, blockHeight, 0.8, 0.8, 'FD');

        let planLineY = lineY + 1.35;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(palette.text[0], palette.text[1], palette.text[2]);
        doc.setFontSize(titleFontSize);
        wrappedPlan.forEach((line: string) => {
          doc.text(line, x + 1.8, planLineY);
          planLineY += titleLineHeight;
        });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(bodyFontSize);

        let rowY = planLineY + (isCompactMode ? 0.18 : 0.35);
        renderedRows.forEach((row) => {
          row.left.forEach((line, lineIndex) => {
            doc.text(line, x + 2, rowY + lineIndex * itemLineHeight);
          });
          if (!isCompactMode) {
            row.right.forEach((line, lineIndex) => {
              doc.text(line, x + 2 + itemColumnWidth + itemColumnGap, rowY + lineIndex * itemLineHeight);
            });
          }
          rowY += row.rowHeight;
        });

        lineY += blockHeight + (isCompactMode ? 0.18 : 0.35);
        currentItemOffset += itemsToRenderCount;

        if (currentItemOffset >= planItems.length) {
          currentPlanIndex += 1;
          currentItemOffset = 0;
        }

        if (currentPlanIndex < entry.items.length && lineY < contentBottom - 0.8) {
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.2);
          doc.line(x + 1.5, lineY, x + w - 1.5, lineY);
          lineY += 0.45;
        }
      }

      return { planIndex: currentPlanIndex, itemOffset: currentItemOffset };
    };

    const gridStartY = tableStartY + colHeaderH;
    const maxCellHeight = isCompactMode ? (contentAreaHeight - 0.8) : 58;
    const minCellHeight = isCompactMode ? 19 : 16;

    let hasRenderedPlanPage = false;

    const renderCompactPlanCalendar = (planRows: CalendarDayCard[][], planTitle: string) => {
      const pageBottom = pageHeight - bottomMargin;
      let startedPage = false;
      let rowCursorY = gridStartY;
      let rowHeightsOnPage: number[] = [];

      const startNewCompactPage = () => {
        if (startedPage) {
          drawTableGrid(gridStartY, rowHeightsOnPage);
          doc.addPage();
          hasRenderedPlanPage = true;
        }
        if (!startedPage && hasRenderedPlanPage) {
          doc.addPage();
        }
        drawPageHeader(planTitle);
        drawTableColumnHeaders(tableStartY);
        rowCursorY = gridStartY;
        rowHeightsOnPage = [];
        startedPage = true;
        hasRenderedPlanPage = true;
      };

      startNewCompactPage();

      for (let rowIndex = 0; rowIndex < planRows.length; rowIndex += 1) {
        const row = planRows[rowIndex];
        const week = row[0]?.week || rowIndex + 1;
        const weekNaturalHeight = Math.max(...row.map((cell) => calcCellNaturalHeight(cell, { planIndex: 0, itemOffset: 0 })));
        const cellH = Math.max(minCellHeight, Math.min(maxCellHeight, weekNaturalHeight));

        if (rowCursorY + cellH > pageBottom && rowHeightsOnPage.length > 0) {
          startNewCompactPage();
        }

        if (weekSideW > 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(marginX, rowCursorY, weekSideW, cellH, 'F');
          doc.setTextColor(71, 85, 105);
          drawVerticalStackedText(`${week}ª SEMANA`, marginX + weekSideW / 2, rowCursorY, cellH);
        }

        row.forEach((cell, colIndex) => {
          const cellX = marginX + weekSideW + colIndex * colW;
          drawCalendarCellTable(
            cell,
            week,
            colIndex === 0,
            cellX,
            rowCursorY,
            colW,
            cellH,
            { planIndex: 0, itemOffset: 0 },
            schoolCalendarEventByDate
          );
        });

        rowHeightsOnPage.push(cellH);
        rowCursorY += cellH;
      }

      if (rowHeightsOnPage.length > 0) {
        drawTableGrid(gridStartY, rowHeightsOnPage);
      }
    };

    if (isCompactMode) {
      planPages.forEach((page) => {
        const planRows = buildCalendarRows(page.planId || undefined);
        renderCompactPlanCalendar(planRows, page.planName);
      });
    } else {
      const rowStates = calendarRows.map((row) => row.map(() => ({ planIndex: 0, itemOffset: 0 })));
      const hasRemainingContentInRange = (startRow: number, endRow: number) => {
        return calendarRows.slice(startRow, endRow).some((row, localRowIndex) => row.some((cell, colIndex) => {
          if (!cell.date || cell.items.length === 0) return false;
          return rowStates[startRow + localRowIndex][colIndex].planIndex < cell.items.length;
        }));
      };

      let pageIndex = 0;
      for (let startRow = 0; startRow < calendarRows.length; startRow += maxWeeksPerPage) {
        const endRow = Math.min(startRow + maxWeeksPerPage, calendarRows.length);

        let safetyCounter = 0;
        while (pageIndex === 0 || hasRemainingContentInRange(startRow, endRow)) {
          if (pageIndex > 0) {
            doc.addPage();
          }

          const previousStates = rowStates.slice(startRow, endRow).map((row) => row.map((cell) => ({ ...cell })));
          const rowHeights: number[] = [];
          for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
            const row = calendarRows[rowIndex];
            const naturalH = Math.max(
              minCellHeight,
              Math.min(
                maxCellHeight,
                Math.max(...row.map((cell, ci) => calcCellNaturalHeight(cell, rowStates[rowIndex][ci])))
              )
            );
            rowHeights.push(naturalH);
          }

          drawPageHeader(type === 'ALMOCO' ? 'Cardápio de Almoço' : 'Cardápio de Lanche');
          drawTableColumnHeaders(tableStartY);

          let rowCursorY = gridStartY;
          for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
            const row = calendarRows[rowIndex];
            const localRowIndex = rowIndex - startRow;
            const cellH = rowHeights[localRowIndex];

            row.forEach((cell, colIndex) => {
              const cellX = marginX + weekSideW + colIndex * colW;
              rowStates[rowIndex][colIndex] = drawCalendarCellTable(
                cell,
                row[0]?.week || rowIndex + 1,
                colIndex === 0,
                cellX,
                rowCursorY,
                colW,
                cellH,
                rowStates[rowIndex][colIndex],
                schoolCalendarEventByDate
              );
            });
            rowCursorY += cellH;
          }

          drawTableGrid(gridStartY, rowHeights);
          pageIndex += 1;
          safetyCounter += 1;

          const progressed = rowStates.slice(startRow, endRow).some((row, localRowIndex) => row.some((cellState, colIndex) => {
            const prevState = previousStates[localRowIndex][colIndex];
            return cellState.planIndex !== prevState.planIndex || cellState.itemOffset !== prevState.itemOffset;
          }));

          if (!progressed || safetyCounter > 10) {
            break;
          }
        }
      }
    }

      const sanitizedEnterpriseName = String(selectedEnterpriseName || 'unidade')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'unidade';

      const fileName = `cardapio_local_${selectedMonth}_${sanitizedEnterpriseName}_${type.toLowerCase()}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Erro ao gerar PDF do cardápio:', error);
      try {
        const fallbackDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const fallbackDate = new Date();
        const fallbackLeftX = 26;
        drawEnterpriseLogoOnPdf(fallbackDoc, String(activeEnterprise?.logo || '').trim(), 14, 7, 9, 'CA');
        fallbackDoc.setFont('helvetica', 'bold');
        fallbackDoc.setFontSize(16);
        fallbackDoc.text('Calendário Escolar - Cardápio Mensal', fallbackLeftX, 16);
        fallbackDoc.setFont('helvetica', 'normal');
        fallbackDoc.setFontSize(11);
        fallbackDoc.text(`Unidade: ${selectedEnterpriseName || 'Unidade'}`, fallbackLeftX, 24);
        fallbackDoc.text(`Mês: ${formatMonthLabel(selectedMonth)}`, fallbackLeftX, 31);
        fallbackDoc.text(`Tipo: ${type === 'ALMOCO' ? 'Almoço' : 'Lanche'}`, fallbackLeftX, 38);
        fallbackDoc.text(`Emitido em: ${fallbackDate.toLocaleDateString('pt-BR')} ${fallbackDate.toLocaleTimeString('pt-BR')}`, fallbackLeftX, 45);
        fallbackDoc.setFont('helvetica', 'bold');
        fallbackDoc.setFontSize(10);
        fallbackDoc.text('Obs.: O layout avançado falhou e este PDF simplificado foi gerado automaticamente.', fallbackLeftX, 56);

        const fallbackSafeName = String(selectedEnterpriseName || 'unidade')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '') || 'unidade';
        fallbackDoc.save(`cardapio_local_${selectedMonth}_${fallbackSafeName}_${type.toLowerCase()}_fallback_${fallbackDate.toISOString().slice(0, 10)}.pdf`);
      } catch (fallbackError) {
        console.error('Erro ao gerar PDF fallback:', fallbackError);
        notificationService.alerta('Falha ao gerar PDF', 'Não foi possível gerar o PDF. Tente novamente.');
      }
    }
  };

  return (
    <div className="dash-shell menu-shell min-h-screen space-y-3">
      {!activeEnterprise ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
            <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando menu...</p>
          </div>
        </div>
      ) : (
      <>
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-zinc-100 tracking-tight flex items-center gap-2 leading-none">
            <UtensilsCrossed className="text-indigo-600" size={18} />
            Grade Mensal
          </h1>
          <p className="text-gray-500 dark:text-zinc-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em]">
            Defina o cardápio com base nos planos contratados • {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={exportWeeklyCalendarPdf}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-zinc-700 text-indigo-700 dark:text-indigo-300 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-indigo-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
            >
              <Calendar size={12} /> Baixar Calendario PDF
            </button>
            <button
              onClick={copyMenuLinkToClipboard}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/35 transition-all flex items-center justify-center gap-1.5"
            >
              {isMenuLinkCopied ? <Check size={12} /> : <Copy size={12} />}
              {isMenuLinkCopied ? 'Link Copiado' : 'Copiar Link Cardapio'}
            </button>
          </div>
          {isOwner && (
            <div className="relative group min-w-[240px]">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 group-hover:text-indigo-600 transition-colors">
                <Building size={18} />
              </div>
              <select 
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-white dark:bg-zinc-900 border border-transparent dark:border-zinc-700 focus:border-indigo-500 rounded-lg shadow-sm outline-none font-black text-[9px] text-gray-700 dark:text-zinc-100 uppercase tracking-[0.12em] appearance-none cursor-pointer transition-all hover:shadow-md"
              >
                {enterprises.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none">
                <ChevronDown size={16} />
              </div>
            </div>
          )}
          
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5">
            <Save size={13} /> Publicar Grade
          </button>
        </div>
      </header>

      <section className="bg-white dark:bg-zinc-900 p-3 rounded-[18px] border border-gray-200 dark:border-zinc-700 shadow-sm">
        <input
          ref={monthlyBackupInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleMonthlyBackupFileChange}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-[0.12em] mr-1">Mês:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthKey())}
            className="h-8 px-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[10px] font-black text-gray-700 dark:text-zinc-100 uppercase tracking-[0.08em] outline-none focus:border-indigo-400"
          />
          <span className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-[0.12em] ml-2">Duplicar para:</span>
          <input
            type="month"
            value={duplicateMonthTarget}
            onChange={(e) => setDuplicateMonthTarget(e.target.value || getNextMonthKey())}
            className="h-8 px-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-950 text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-[0.08em] outline-none focus:border-emerald-400"
          />
          <button
            onClick={duplicateToMonth}
            className="h-8 px-3 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/35 transition-all flex items-center justify-center gap-1.5"
          >
            <CalendarDays size={12} /> Duplicar Dados
          </button>
          <button
            onClick={backupMonthlyMenuLocal}
            className="h-8 px-3 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/35 transition-all flex items-center justify-center gap-1.5"
          >
            <Save size={12} /> Backup Mês
          </button>
          <button
            onClick={triggerMonthlyBackupRestorePicker}
            className="h-8 px-3 bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-violet-50 dark:hover:bg-violet-950/35 transition-all flex items-center justify-center gap-1.5"
          >
            <Calendar size={12} /> Restaurar Backup
          </button>
        </div>
        {pendingMonthlyBackup && (
          <div className="mt-2.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-2.5 flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
              Primeiro dia para iniciar restauração:
            </p>
            <select
              value={restoreStartDateKey}
              onChange={(e) => setRestoreStartDateKey(e.target.value)}
              className="h-8 min-w-[190px] rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-zinc-950 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-violet-700 dark:text-violet-200 outline-none focus:border-violet-400"
            >
              {restoreOpenSlots.map((slot) => (
                <option key={`restore-slot-${slot.dateKey}-${slot.week}-${slot.dayOfWeek}`} value={slot.dateKey}>
                  {SHORT_DAY_LABEL[slot.dayOfWeek]} • {formatDateFullBr(slot.date)}
                </option>
              ))}
            </select>
            <button
              onClick={applyMonthlyRestore}
              className="h-8 px-3 rounded-lg bg-violet-600 text-white text-[9px] font-black uppercase tracking-[0.12em] hover:bg-violet-700 transition-all"
            >
              Aplicar Restauração
            </button>
            <button
              onClick={cancelMonthlyRestore}
              className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-zinc-300 hover:text-gray-700 dark:hover:text-zinc-100"
            >
              Cancelar
            </button>
            <p className="w-full text-[8px] font-semibold text-violet-700/80 dark:text-violet-300/80">
              O cardápio será distribuído a partir do dia escolhido, respeitando os dias letivos abertos no calendário escolar.
            </p>
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-pulse">
           <RefreshCw size={48} className="text-indigo-400 animate-spin" />
           <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[4px]">Sincronizando grade mensal...</p>
        </div>
      ) : (
        <div className="space-y-3 animate-in fade-in duration-500">
          {activeServiceDays.length === 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-5 text-center">
              <p className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-[0.16em]">
                Nenhum dia de atendimento ativo em Ajustes &gt; Atendimento.
              </p>
            </div>
          )}
          {WEEK_OPTIONS.map((week) => {
            const weekMenuAll = weeklyMenuByWeek[week] || generateInitialMenu();
            const weekMenu = weekMenuAll.filter((day) => (
              Boolean(getDateForWeekAndDay(selectedMonth, week, day.dayOfWeek as DayOfWeek))
              && activeServiceDaySet.has(day.dayOfWeek as DayOfWeek)
            ));
            const weekMenuByDay = new Map<DayOfWeek, MenuDay>(
              weekMenu.map((day) => [day.dayOfWeek as DayOfWeek, day as MenuDay])
            );
            const weekGridDays: Array<MenuDay | null> = WEEKDAY_GRID_ORDER.map((dayKey) => weekMenuByDay.get(dayKey) ?? null);
            if (weekGridDays.every((day) => !day)) return null;
            return (
              <section key={`week-grid-${week}`} className="space-y-1.5 w-full">
                <h2 className="text-base md:text-lg font-black text-indigo-700 uppercase tracking-[0.16em] px-0">{week}ª Semana</h2>
                <div className="grid items-stretch grid-cols-5 gap-1.5 w-full">
                  {weekGridDays.map((day, dayIndex) => {
                    if (!day) {
                      return <div key={`week-${week}-placeholder-${WEEKDAY_GRID_ORDER[dayIndex]}`} className="min-w-0" aria-hidden="true" />;
                    }

                    const dayDate = getDateForWeekAndDay(selectedMonth, week, day.dayOfWeek as DayOfWeek);
                    const dayOfMonth = dayDate ? `${dayDate.getDate()}`.padStart(2, '0') : '--';
                    const isBlockedDay = dayDate ? !isSchoolDateAllowed(dayDate) : false;
                    const eventTitle = isBlockedDay ? (getSchoolEventTitle(dayDate) || 'Feriado/Recesso') : null;
                    const dayDropKey = `${week}-${day.id}`;

                    if (isBlockedDay) {
                      return (
                        <div
                          key={`week-${week}-${day.id}`}
                          className="flex flex-col gap-1.5 self-start h-full min-w-0"
                        >
                          <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border-b-2 border-rose-400 dark:border-rose-700 shadow-sm flex items-center justify-between gap-2">
                            <div>
                              <h3 className="text-sm md:text-base font-black text-rose-700 dark:text-rose-300 uppercase tracking-[0.12em]">{SHORT_DAY_LABEL[day.dayOfWeek as DayOfWeek]}</h3>
                            </div>
                            <span className="min-w-[34px] h-8 px-1 rounded-lg bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-300 text-[16px] leading-none font-black flex items-center justify-center">
                              {dayOfMonth}
                            </span>
                          </div>
                          <div className="rounded-xl transition-all flex-1 min-h-[280px] flex flex-col bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-800 shadow-sm p-3 md:p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <AlertTriangle size={16} className="text-rose-400 dark:text-rose-300 shrink-0" />
                            </div>
                            <p className="text-[10px] font-black text-rose-600 dark:text-rose-300 uppercase tracking-[0.08em] leading-relaxed flex-1" title={eventTitle!}>
                              {eventTitle}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
            <div
              key={`week-${week}-${day.id}`}
              className="flex flex-col gap-0.5 self-start h-full w-full min-w-0"
            >
              <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl border-b-2 border-indigo-500 dark:border-indigo-700 shadow-sm flex items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleDayDuplicatePicker(week, day)}
                    className="w-6 h-6 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-600 dark:text-emerald-300 rounded-md flex items-center justify-center hover:bg-emerald-600 dark:hover:bg-emerald-500 hover:text-white transition-all shadow-inner flex-shrink-0"
                    title="Duplicar dia"
                  >
                    <CalendarDays size={12} />
                  </button>
                  <button 
                    onClick={() => {
                      if (plansCatalog.length === 0) {
                        addItemToDay(week, day.id);
                        return;
                      }
                      const dayKey = `${week}-${day.id}`;
                      setOpenPlanPickerDayId((prev) => prev === dayKey ? null : dayKey);
                      setNewItemPlanByDay((prev) => ({
                        ...prev,
                        [dayKey]: prev[dayKey] || plansCatalog[0]?.id || '',
                      }));
                    }}
                    className="w-6 h-6 bg-indigo-50 dark:bg-indigo-950/35 text-indigo-600 dark:text-indigo-300 rounded-md flex items-center justify-center hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all shadow-inner flex-shrink-0"
                    title="Adicionar opção"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={() => openDayPlanActionModal(week, day.id, 'EDIT')}
                    className="w-6 h-6 bg-blue-50 dark:bg-blue-950/35 text-blue-600 dark:text-blue-300 rounded-md flex items-center justify-center hover:bg-blue-600 dark:hover:bg-blue-500 hover:text-white transition-all shadow-inner flex-shrink-0"
                    title="Editar ficha"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={() => openDayPlanActionModal(week, day.id, 'DELETE')}
                    className="w-6 h-6 bg-red-50 dark:bg-red-950/35 text-red-600 dark:text-red-300 rounded-md flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-500 hover:text-white transition-all shadow-inner flex-shrink-0"
                    title="Remover opção"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="text-[10px] font-black text-gray-700 dark:text-zinc-200 uppercase tracking-[0.1em] whitespace-nowrap">{SHORT_DAY_LABEL[day.dayOfWeek as DayOfWeek]}</h3>
                  <span className="min-w-[30px] h-7 px-1 rounded-md bg-indigo-50 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[14px] leading-none font-black flex items-center justify-center flex-shrink-0">
                    {dayOfMonth}
                  </span>
                </div>
              </div>
              {dayDuplicateTarget?.sourceWeek === week && dayDuplicateTarget?.sourceDayId === day.id && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-emerald-100 dark:border-emerald-800 shadow-sm p-2.5 space-y-2">
                  <p className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                    Duplicar {SHORT_DAY_LABEL[day.dayOfWeek as DayOfWeek]} para:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={dayDuplicateTarget.targetWeek}
                      onChange={(e) => {
                        const nextWeek = Math.max(1, Math.min(5, Number(e.target.value || week) || week));
                        const availableDays = getExistingDayKeysForWeek(nextWeek);
                        setDayDuplicateTarget((prev) => {
                          if (!prev) return prev;
                          const nextDay = availableDays.includes(prev.targetDayOfWeek)
                            ? prev.targetDayOfWeek
                            : (availableDays[0] || prev.targetDayOfWeek);
                          return { ...prev, targetWeek: nextWeek, targetDayOfWeek: nextDay };
                        });
                      }}
                      className="h-8 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-700 dark:text-zinc-100 focus:outline-none focus:border-emerald-400"
                    >
                      {WEEK_OPTIONS.map((week) => (
                        <option key={`dup-week-${week}`} value={week}>
                          {week}ª Semana
                        </option>
                      ))}
                    </select>
                    <select
                      value={dayDuplicateTarget.targetDayOfWeek}
                      onChange={(e) => {
                        const nextDay = (e.target.value || day.dayOfWeek) as DayOfWeek;
                        setDayDuplicateTarget((prev) => prev ? { ...prev, targetDayOfWeek: nextDay } : prev);
                      }}
                      className="h-8 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-700 dark:text-zinc-100 focus:outline-none focus:border-emerald-400"
                    >
                      {getExistingDayKeysForWeek(dayDuplicateTarget.targetWeek).map((dayKey) => (
                        <option key={`dup-day-${dayKey}`} value={dayKey}>
                          {SHORT_DAY_LABEL[dayKey]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setDayDuplicateTarget(null)}
                      className="px-3 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-300 hover:text-gray-700 dark:hover:text-zinc-100"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={applyDayDuplication}
                      className="px-3 h-8 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700"
                    >
                      Duplicar dia
                    </button>
                  </div>
                </div>
              )}
              {openPlanPickerDayId === `${week}-${day.id}` && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-indigo-100 dark:border-indigo-800 shadow-sm p-2.5 space-y-1.5">
                  <p className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Escolha o plano para criar o cardápio</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={newItemPlanByDay[`${week}-${day.id}`] || ''}
                      onChange={(e) => {
                        const nextPlanId = e.target.value;
                        setNewItemPlanByDay((prev) => ({ ...prev, [`${week}-${day.id}`]: nextPlanId }));
                      }}
                      className="flex-1 h-8 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-gray-700 dark:text-zinc-100 focus:outline-none focus:border-indigo-400"
                    >
                      {plansCatalog.length === 0 ? (
                        <option value="">Sem planos ativos</option>
                      ) : (
                        plansCatalog.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      onClick={() => addItemToDay(week, day.id, newItemPlanByDay[`${week}-${day.id}`])}
                      className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.12em] hover:bg-indigo-700"
                    >
                      Criar
                    </button>
                  </div>
                </div>
              )}

              <div
                className={`rounded-xl transition-all flex-1 min-h-[280px] flex flex-col ${dragOverDayKey === dayDropKey ? 'ring-2 ring-indigo-300 ring-offset-1 bg-indigo-50/40 dark:bg-indigo-950/35' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggingMenuItem) {
                    setDragOverDayKey(dayDropKey);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropMenuItem(week, day.id);
                }}
              >
                {day.items.length > 0 && (
                  <div className={`rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col h-full ${day.items.length > 1 ? 'grid grid-rows-[repeat(auto-fit,1fr)]' : ''}`}>
                    {day.items.map((item, itemIndex) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggingMenuItem({ week, dayId: day.id, itemId: item.id })}
                        onDragEnd={() => {
                          setDraggingMenuItem(null);
                          setDragOverDayKey(null);
                        }}
                        className={`px-3 md:px-4 py-3 md:py-4 transition-colors group cursor-grab active:cursor-grabbing border-l-4 border-y border-r flex-1 flex flex-col ${itemIndex > 0 ? 'border-t-0' : ''} ${(() => { const planColor = getPlanCardColor(item.planId, item.name); return `${planColor.bg} ${planColor.border}`; })()}`}
                      >
                        <div className={`flex flex-col gap-2 ${day.items.length === 1 ? 'flex-1' : ''}`}>
                          <div className="w-full flex-1 flex flex-col gap-2">
                            {(() => {
                              const planColor = getPlanCardColor(item.planId, item.name);
                              return (
                                <>
                                  <p className={`text-[10px] md:text-[11px] font-black uppercase tracking-tight break-words ${planColor.title}`}>
                                    {item.name}
                                  </p>
                                  {item.planId && (
                                    <p className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.12em] mt-1 break-words ${planColor.badge}`}>
                                      Plano: {plansCatalog.find((plan) => plan.id === item.planId)?.name || 'Plano vinculado'}
                                    </p>
                                  )}
                                  {item.ingredients.length > 0 ? (
                                    <ul className="mt-2 space-y-1">
                                      {item.ingredients.map((ing) => (
                                        <li
                                          key={ing.id}
                                          className={`text-[9px] md:text-[10px] font-semibold leading-snug list-disc list-inside break-words ${planColor.text}`}
                                        >
                                          {ing.name}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className={`text-[9px] md:text-[10px] font-semibold leading-snug mt-1 break-words ${planColor.text}`}>
                                      {item.description?.trim() || 'Sem insumos definidos'}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <div className="w-full text-left mt-auto pt-2 border-t border-gray-200/50">
                            <p className={`text-[9px] md:text-[10px] font-black ${(() => { const planColor = getPlanCardColor(item.planId, item.name); return planColor.kcal; })()}`}>
                              {calculateTotalNutrients(item.ingredients).calories} kcal
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {dayPlanActionModal && (() => {
        const targetDay = (weeklyMenuByWeek[dayPlanActionModal.week] || []).find((day) => day.id === dayPlanActionModal.dayId);
        const dayItems = Array.isArray(targetDay?.items) ? targetDay.items : [];
        const actionLabel = dayPlanActionModal.mode === 'EDIT' ? 'Editar' : 'Apagar';
        return (
          <div className="fixed inset-0 z-[620] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm" onClick={() => setDayPlanActionModal(null)}></div>
            <div className="relative w-full max-w-xl bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 bg-indigo-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">{actionLabel} plano do dia</h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-200 mt-1">
                    Selecione o plano criado nesse dia
                  </p>
                </div>
                <button onClick={() => setDayPlanActionModal(null)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
                {dayItems.map((item) => {
                  const planName = item.planId
                    ? (plansCatalog.find((plan) => plan.id === item.planId)?.name || 'Plano vinculado')
                    : 'Sem plano vinculado';
                  return (
                    <button
                      key={`day-plan-action-${item.id}`}
                      onClick={() => {
                        if (dayPlanActionModal.mode === 'EDIT') {
                          setEditingItem({ week: dayPlanActionModal.week, dayId: dayPlanActionModal.dayId, item });
                        } else {
                          removeItemFromDay(dayPlanActionModal.week, dayPlanActionModal.dayId, item.id);
                        }
                        setDayPlanActionModal(null);
                      }}
                      className="w-full text-left px-3 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors bg-white dark:bg-zinc-900"
                    >
                      <p className="text-xs font-black text-gray-800 dark:text-zinc-100 uppercase tracking-wide">{item.name}</p>
                      <p className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mt-1">{planName}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {editingItem && (
        <div className="fixed inset-0 z-[600] flex justify-end animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm" onClick={() => setEditingItem(null)}></div>
           <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-950 h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-500">
              
              <div className="bg-indigo-900 p-8 text-white flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center shadow-lg backdrop-blur-md border border-white/10">
                       <UtensilsCrossed size={28} className="text-indigo-300" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight">Montagem do Cardápio</h2>
                       <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-1">
                         {editingDayLabel ? `Dia em edição: ${editingDayLabel} • ` : ''}Configuração de título, descrição e insumos
                       </p>
                    </div>
                 </div>
                 <button onClick={() => setEditingItem(null)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide pb-32">
                 {/* Título e descrição */}
                 <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest ml-1">Título do Cardápio</label>
                       <input 
                         value={editingItem.item.name}
                         onChange={(e) => setEditingItem({...editingItem, item: { ...editingItem.item, name: e.target.value }})}
                         className="w-full text-xl font-black text-gray-800 dark:text-zinc-100 text-center bg-gray-50 dark:bg-zinc-900 border-2 border-transparent dark:border-zinc-700 focus:border-indigo-500 rounded-2xl px-6 py-4 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                         placeholder="Ex: Frango grelhado com arroz integral"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest ml-1">Descrição</label>
                       <textarea
                         value={editingItem.item.description || ''}
                         onChange={(e) => setEditingItem({...editingItem, item: { ...editingItem.item, description: e.target.value }})}
                         className="w-full min-h-[110px] text-sm font-bold text-gray-700 dark:text-zinc-100 bg-gray-50 dark:bg-zinc-900 border-2 border-transparent dark:border-zinc-700 focus:border-indigo-500 rounded-2xl px-5 py-4 outline-none transition-all resize-none placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                         placeholder="Descreva o preparo, acompanhamentos e observações."
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest ml-1">Plano vinculado</label>
                      <select
                        value={editingItem.item.planId || ''}
                        onChange={(e) => {
                          const nextPlanId = e.target.value;
                          const nextPlan = plansCatalog.find((plan) => plan.id === nextPlanId);
                          setEditingItem({
                            ...editingItem,
                            item: {
                              ...editingItem.item,
                              planId: nextPlanId || undefined,
                              name: nextPlan ? nextPlan.name : editingItem.item.name,
                            },
                          });
                        }}
                        className="w-full h-12 rounded-2xl border border-gray-200 dark:border-zinc-700 px-4 text-sm font-black text-gray-700 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 bg-white dark:bg-zinc-900"
                      >
                        <option value="">Sem plano vinculado</option>
                        {plansCatalog.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                      {selectedPlanName && (
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">
                          Plano atual: {selectedPlanName}
                        </p>
                      )}
                 </div>

                 {/* COMPONENTES NUTRICIONAIS */}
                 <div className="space-y-6">
                    <div className="flex items-center justify-between border-b pb-4">
                       <h3 className="text-xs font-black text-gray-800 dark:text-zinc-100 uppercase tracking-[2px] flex items-center gap-2">
                          <Utensils size={18} className="text-indigo-600" /> Componentes e Insumos
                       </h3>
                       <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest">Monte os insumos por item</p>
                    </div>

                    <div className="space-y-4">
                       <div className="bg-indigo-50/60 dark:bg-zinc-900/80 border border-indigo-100 dark:border-zinc-700 rounded-2xl p-4">
                         <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                           <div className="md:col-span-7 relative">
                             <label className="text-[10px] font-black text-indigo-500 dark:text-indigo-300 uppercase tracking-widest ml-1">Nome do item</label>
                             <input
                               value={quickIngredientQuery}
                               onFocus={() => setIsQuickIngredientListOpen(true)}
                               onBlur={() => {
                                 setTimeout(() => {
                                   setIsQuickIngredientListOpen(false);
                                   setQuickIngredientHighlightedIndex(-1);
                                 }, 120);
                               }}
                               onChange={(e) => {
                                 setQuickIngredientQuery(e.target.value);
                                 setIsQuickIngredientListOpen(true);
                                 setQuickIngredientHighlightedIndex(0);
                               }}
                               onKeyDown={(e) => {
                                 if (e.key === 'ArrowDown') {
                                   e.preventDefault();
                                   if (quickIngredientSuggestions.length === 0) return;
                                   setIsQuickIngredientListOpen(true);
                                   setQuickIngredientHighlightedIndex((prev) => {
                                     const next = prev + 1;
                                     return next >= quickIngredientSuggestions.length ? 0 : next;
                                   });
                                   return;
                                 }
                                 if (e.key === 'ArrowUp') {
                                   e.preventDefault();
                                   if (quickIngredientSuggestions.length === 0) return;
                                   setIsQuickIngredientListOpen(true);
                                   setQuickIngredientHighlightedIndex((prev) => {
                                     const next = prev <= 0 ? quickIngredientSuggestions.length - 1 : prev - 1;
                                     return next;
                                   });
                                   return;
                                 }
                                 if (e.key === 'Enter') {
                                   e.preventDefault();
                                   const selectedSuggestion = quickIngredientHighlightedIndex >= 0
                                     ? quickIngredientSuggestions[quickIngredientHighlightedIndex]
                                     : quickIngredientSuggestions[0];
                                   if (quickIngredientSuggestions.length > 0) {
                                     addIngredientFromQuickForm(selectedSuggestion);
                                   } else {
                                     addIngredientFromQuickForm();
                                   }
                                   return;
                                 }
                                 if (e.key === 'Escape') {
                                   setIsQuickIngredientListOpen(false);
                                   setQuickIngredientHighlightedIndex(-1);
                                 }
                               }}
                               className="mt-1 w-full bg-white dark:bg-zinc-950 border-2 border-transparent dark:border-zinc-700 focus:border-indigo-400 dark:focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 outline-none"
                               placeholder="Digite para buscar na base nutricional..."
                             />
                             {isQuickIngredientListOpen && (
                               <div className="absolute z-[710] left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-zinc-700 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                                 {isLoadingQuickIngredientSuggestions && (
                                   <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-zinc-300">
                                     Buscando insumos...
                                   </div>
                                 )}
                                 {!isLoadingQuickIngredientSuggestions && quickIngredientSuggestions.length === 0 && quickIngredientQuery.trim() && (
                                   <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-zinc-300">
                                     Nenhum insumo encontrado.
                                   </div>
                                 )}
                                 {!isLoadingQuickIngredientSuggestions && quickIngredientSuggestions.map((item) => (
                                   <button
                                     type="button"
                                     key={item.id}
                                     onMouseDown={(e) => e.preventDefault()}
                                     onMouseEnter={() => {
                                       const idx = quickIngredientSuggestions.findIndex((candidate) => candidate.id === item.id);
                                       setQuickIngredientHighlightedIndex(idx);
                                     }}
                                     onClick={() => addIngredientFromQuickForm(item)}
                                     className={`w-full text-left px-3 py-2 border-b border-indigo-100 dark:border-zinc-700 last:border-b-0 ${quickIngredientSuggestions[quickIngredientHighlightedIndex]?.id === item.id ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'hover:bg-indigo-50 dark:hover:bg-zinc-800/80'}`}
                                   >
                                     <p className="text-xs font-black text-gray-800 dark:text-zinc-100 uppercase">{item.name}</p>
                                     <p className="text-[10px] font-semibold text-gray-500 dark:text-zinc-300">{item.calories} kcal • {item.proteins}P • {item.carbs}C • {item.fats}G (base 100{item.unit})</p>
                                   </button>
                                 ))}
                               </div>
                             )}
                           </div>
                           <div className="md:col-span-2">
                             <div className="flex items-center gap-2 ml-1 mb-1">
                               <label className="text-[10px] font-black text-indigo-500 dark:text-indigo-300 uppercase tracking-widest">Qtd/gramagem</label>
                               <button
                                 type="button"
                                 onClick={() => setQuickIngredientGramsEnabled((v) => !v)}
                                 className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                                   quickIngredientGramsEnabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-zinc-700'
                                 }`}
                                 title={quickIngredientGramsEnabled ? 'Desativar gramagem' : 'Ativar gramagem'}
                               >
                                 <span
                                   className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                                     quickIngredientGramsEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                                   }`}
                                 />
                               </button>
                             </div>
                             <input
                               type="number"
                               min={1}
                               value={quickIngredientWeight}
                               onChange={(e) => setQuickIngredientWeight(e.target.value)}
                               disabled={!quickIngredientGramsEnabled}
                               className={`w-full bg-white dark:bg-zinc-950 border-2 border-transparent dark:border-zinc-700 focus:border-indigo-400 rounded-xl px-3 py-2.5 text-sm font-black outline-none transition-opacity placeholder:text-gray-400 dark:placeholder:text-zinc-500 ${
                                 quickIngredientGramsEnabled ? 'text-gray-700 dark:text-zinc-100 opacity-100' : 'text-gray-400 dark:text-zinc-500 opacity-40 cursor-not-allowed'
                               }`}
                               placeholder="100"
                             />
                           </div>
                           <div className="md:col-span-3 flex items-end">
                             <button
                               type="button"
                               onClick={() => addIngredientFromQuickForm()}
                               className="w-full text-[10px] font-black text-indigo-600 dark:text-indigo-300 bg-white dark:bg-zinc-900 px-4 py-3 rounded-xl hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all uppercase tracking-widest border border-indigo-200 dark:border-zinc-700 flex items-center justify-center gap-2"
                             >
                               <Plus size={15} /> Adicionar à Lista
                             </button>
                           </div>
                         </div>
                       </div>

                       {editingItem.item.ingredients.length === 0 ? (
                         <div className="text-center py-16 bg-gray-50 dark:bg-zinc-900 rounded-[40px] border-2 border-dashed border-gray-200 dark:border-zinc-700">
                            <Info size={40} className="mx-auto text-gray-300 dark:text-zinc-600 mb-3" />
                            <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest">Nenhum componente vinculado a esta opção</p>
                         </div>
                       ) : (
                         <div className="space-y-2">
                           {editingItem.item.ingredients.map((ing) => (
                             <div key={ing.id} className="bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-gray-100 dark:border-zinc-700 shadow-sm">
                               <div className="flex items-center justify-between gap-3">
                                 <div className="min-w-0">
                                   <p className="text-sm font-black text-gray-800 dark:text-zinc-100 truncate">{ing.name}</p>
                                   <p className="text-[11px] text-gray-500 dark:text-zinc-300 font-semibold mt-0.5">
                                     {Number(ing.calories || 0).toFixed(1)} kcal • P {Number(ing.proteins || 0).toFixed(1)}g • C {Number(ing.carbs || 0).toFixed(1)}g • G {Number(ing.fats || 0).toFixed(1)}g
                                   </p>
                                 </div>
                                 <div className="shrink-0 flex items-center gap-2">
                                   <button
                                     onClick={() => toggleIngredientReplicatePicker(ing.id)}
                                     className="h-8 px-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                                     title="Repetir ingrediente em outros dias"
                                   >
                                     <CalendarDays size={13} /> Repetir
                                   </button>
                                   <button
                                     onClick={() => removeIngredient(ing.id)}
                                     className="p-2.5 text-gray-400 dark:text-zinc-400 hover:text-red-500 dark:hover:text-rose-300 hover:bg-red-50 dark:hover:bg-rose-950/40 rounded-xl transition-all"
                                     title="Remover item"
                                   >
                                     <Trash2 size={18} />
                                   </button>
                                 </div>
                               </div>
                               {ingredientReplicateTargetId === ing.id && (
                                 <div className="mt-3 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30">
                                   <p className="text-[10px] font-black text-gray-500 dark:text-zinc-300 uppercase tracking-widest mb-2">
                                     Repetir este item em:
                                   </p>
                                   <div className="grid grid-cols-3 gap-2">
                                     {DAYS_OF_WEEK.map((dayKey) => {
                                       const isCurrentDay = dayKey === editingDayLabel;
                                       const checked = ingredientReplicateDays.includes(dayKey);
                                       return (
                                         <label
                                           key={dayKey}
                                           className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-1.5 rounded-lg ${isCurrentDay ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300' : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-200 border border-gray-200 dark:border-zinc-700 cursor-pointer'}`}
                                         >
                                           <input
                                             type="checkbox"
                                             checked={checked}
                                             disabled={isCurrentDay}
                                             onChange={() => {
                                               setIngredientReplicateDays((prev) => {
                                                 if (checked) return prev.filter((v) => v !== dayKey);
                                                 return [...prev, dayKey];
                                               });
                                             }}
                                           />
                                           {SHORT_DAY_LABEL[dayKey]}
                                         </label>
                                       );
                                     })}
                                   </div>
                                   <div className="mt-3 flex justify-end gap-2">
                                     <button
                                       onClick={() => {
                                         setIngredientReplicateTargetId(null);
                                         setIngredientReplicateDays([]);
                                       }}
                                       className="px-3 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-300 hover:text-gray-700 dark:hover:text-zinc-100"
                                     >
                                       Cancelar
                                     </button>
                                     <button
                                       onClick={applyIngredientReplication}
                                       className="px-3 h-8 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700"
                                     >
                                       Aplicar
                                     </button>
                                   </div>
                                 </div>
                               )}
                             </div>
                           ))}
                         </div>
                       )}
                    </div>
                 </div>

                 {/* Totais do Prato */}
                 <div className="bg-indigo-900 rounded-[40px] p-10 text-white flex flex-wrap items-center justify-around gap-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-indigo-300 to-indigo-500 opacity-20"></div>
                    <TotalNutrient color="text-amber-400" label="Energia" value={calculateTotalNutrients(editingItem.item.ingredients).calories} unit="kcal" />
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <TotalNutrient color="text-blue-400" label="Proteínas" value={calculateTotalNutrients(editingItem.item.ingredients).proteins} unit="g" />
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <TotalNutrient color="text-indigo-300" label="Carbos" value={calculateTotalNutrients(editingItem.item.ingredients).carbs} unit="g" />
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <TotalNutrient color="text-rose-400" label="Gorduras" value={calculateTotalNutrients(editingItem.item.ingredients).fats} unit="g" />
                 </div>
              </div>

              {/* Botões de Ação Fixos no Rodapé */}
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.05)] z-[600]">
                 <div className="flex flex-col">
                    <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${canSaveFicha ? 'text-emerald-600' : 'text-amber-500'}`}>
                       {canSaveFicha ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>} 
                       {canSaveFicha ? 'Pronto para salvar' : 'Ação Necessária'}
                    </p>
                    <p className="text-[8px] font-bold text-gray-400 dark:text-zinc-400 uppercase mt-1 leading-relaxed">
                       {!editingItem?.item.name?.trim() ? '• Informe um título. ' : ''}
                       {editingItem?.item.ingredients.length === 0 ? '• Adicione pelo menos 1 componente.' : ''}
                    </p>
                 </div>
                 <div className="flex gap-4 w-full sm:w-auto">
                    <button onClick={() => setEditingItem(null)} className="px-10 py-5 text-xs font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest hover:text-gray-600 dark:hover:text-zinc-200 transition-colors">Cancelar</button>
                    <button 
                      onClick={saveEditingItem} 
                      disabled={!canSaveFicha}
                      className={`flex-1 sm:flex-none px-14 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest shadow-2xl transition-all flex items-center justify-center gap-3 ${
                        canSaveFicha 
                          ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700 active:scale-95' 
                          : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <Save size={20} /> Salvar Ficha
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};

const TotalNutrient = ({ label, value, unit, color }: any) => (
  <div className="text-center group flex flex-col items-center">
     <p className="text-[9px] font-black text-white/50 uppercase tracking-[3px] mb-3 group-hover:text-white transition-colors">{label}</p>
     <p className={`text-4xl font-black leading-none ${color} tracking-tighter group-hover:scale-110 transition-transform`}>
       {value}<span className="text-xs font-black ml-1.5 opacity-50">{unit}</span>
     </p>
  </div>
);

export default MenuManagementPage;

