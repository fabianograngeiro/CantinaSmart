import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import { 
  Plus, Trash2, Save,
  Info, Calendar,
  UtensilsCrossed, X, CheckCircle2,
  Building, ChevronDown, RefreshCw, Utensils,
  Edit3, Clock, AlertCircle, CalendarDays, AlertTriangle
} from 'lucide-react';
import { MenuDay, MenuItem, Ingredient, User, Enterprise, Role, Plan } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';
import { extractSchoolCalendarOperationalData } from '../utils/schoolCalendar';

const DAYS_OF_WEEK: ('SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO')[] = [
  'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'
];
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
const SHORT_DAY_LABEL: Record<(typeof DAYS_OF_WEEK)[number], string> = {
  SEGUNDA: 'SEG',
  TERCA: 'TER',
  QUARTA: 'QUA',
  QUINTA: 'QUI',
  SEXTA: 'SEX',
  SABADO: 'SAB',
};
const DAY_OF_WEEK_TO_JS: Record<DayOfWeek, number> = {
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
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
  const firstJsDay = firstDay.getDay(); // 0=DOM ... 6=SAB
  const targetJsDay = DAY_OF_WEEK_TO_JS[dayOfWeek];
  const offset = (targetJsDay - firstJsDay + 7) % 7;
  const dayOfMonth = 1 + offset + (Math.max(1, Number(weekIndex || 1)) - 1) * 7;

  const resolved = new Date(year, month - 1, dayOfMonth);
  if (resolved.getMonth() !== month - 1) return null;
  return resolved;
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
  const [dayDuplicateTarget, setDayDuplicateTarget] = useState<{
    sourceWeek: number;
    sourceDayId: string;
    sourceDayOfWeek: DayOfWeek;
    targetWeek: number;
    targetDayOfWeek: DayOfWeek;
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

    const calendarRows: CalendarDayCard[][] = WEEK_OPTIONS.map((week) => {
      const weekDays = weeklyMenuByWeek[week] || [];
      return activeServiceDays.map((dayOfWeek) => {
        const matchedDay = weekDays.find((day) => day.dayOfWeek === dayOfWeek);
        return {
          week,
          dayOfWeek,
          date: getDayDateForWeek(week, dayOfWeek),
          items: Array.isArray(matchedDay?.items) ? matchedDay!.items : [],
        };
      });
    }).filter((row) => row.some((cell) => Boolean(cell.date)));

    const hasAnyPlan = calendarRows.some((row) => row.some((cell) => cell.date && cell.items.length > 0));
    if (!hasAnyPlan) {
      notificationService.alerta('Sem planos no mês', 'Não há dias com planos cadastrados para exportar neste mês.');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedAt = new Date();
    const planNameById = new Map(plansCatalog.map((plan) => [plan.id, plan.name]));

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const tableStartY = 44;
    const bottomMargin = 12;
    const tableWidth = pageWidth - marginX * 2;
    const contentAreaHeight = pageHeight - tableStartY - bottomMargin;
    const colHeaderH = 9;
    const colCount = activeServiceDays.length;
    const colW = tableWidth / colCount;
    const maxWeeksPerPage = Math.max(1, Math.min(3, calendarRows.length));

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

    const drawPageHeader = () => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 8, 15, 15, 2.5, 2.5, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CA', 16.2, 17.8);

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15.5);
      doc.text('GRADE MENSAL DE CARDAPIO', 33, 14.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.2);
      doc.text(String(selectedEnterpriseName || 'UNIDADE').toUpperCase(), 33, 20.2);

      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        `${formatMonthLabel(selectedMonth)} | Unidade: ${selectedEnterpriseName} | Refeicao: ${type === 'ALMOCO' ? 'Almoco' : 'Lanche'}`,
        14,
        35
      );
      doc.text(
        `Gerado em: ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`,
        pageWidth - 86,
        35
      );
      doc.setDrawColor(229, 231, 235);
      doc.line(10, 38, pageWidth - 10, 38);
    };

    const getPlanItems = (item: MenuItem) => (
      (item.ingredients?.length || 0) > 0
        ? item.ingredients.map((ing) => String(ing.name || ''))
        : [String(item.description || 'Sem insumos definidos')]
    );

    const truncatePdfText = (value: string, maxWidth: number) => {
      const lines = doc.splitTextToSize(String(value || ''), maxWidth);
      if (lines.length <= 1) return lines[0] || '';
      let base = String(lines[0] || '').trim();
      while (base.length > 0 && doc.getTextWidth(`${base}...`) > maxWidth) {
        base = base.slice(0, -1).trimEnd();
      }
      return `${base}...`;
    };

    const drawTableColumnHeaders = (startY: number) => {
      activeServiceDays.forEach((day, i) => {
        const cx = marginX + i * colW;
        const accent = weekdayColor[day] || [79, 70, 229];
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(cx, startY, colW, colHeaderH, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(day, cx + colW / 2, startY + 6, { align: 'center' });
      });
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.35);
      doc.rect(marginX, startY, tableWidth, colHeaderH);
      for (let i = 1; i < colCount; i += 1) {
        const lx = marginX + i * colW;
        doc.line(lx, startY, lx, startY + colHeaderH);
      }
    };

    const drawTableGrid = (startY: number, rowHeights: number[]) => {
      const totalH = rowHeights.reduce((a, b) => a + b, 0);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.25);
      doc.rect(marginX, startY, tableWidth, totalH);
      let rCursorY = startY;
      for (let r = 0; r < rowHeights.length - 1; r += 1) {
        rCursorY += rowHeights[r];
        doc.line(marginX, rCursorY, marginX + tableWidth, rCursorY);
      }
      for (let c = 1; c < colCount; c += 1) {
        const lx = marginX + c * colW;
        doc.line(lx, startY, lx, startY + totalH);
      }
    };

    const cellPaddingTop = 9;
    const titleFontSize = 5.9;
    const bodyFontSize = 6.5;
    const titleLineHeight = 2.8;
    const itemLineHeight = 3.6;
    const itemColumnGap = 1.4;

    const calcCellNaturalHeight = (
      entry: CalendarDayCard,
      state: { planIndex: number; itemOffset: number }
    ): number => {
      if (!entry.date || entry.items.length === 0) return cellPaddingTop + 4;
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
        const rowsNeeded = Math.ceil(remainingItems.length / 2);
        const blockHeight = 2.3 + titleHeight + rowsNeeded * itemLineHeight + 0.8;
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
      state: { planIndex: number; itemOffset: number }
    ) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, h, 'F');

      if (!entry.date) {
        doc.setFillColor(248, 250, 252);
        doc.rect(x, y, w, h, 'F');
        return state;
      }

      const accent = weekdayColor[entry.dayOfWeek] || [79, 70, 229];

      if (isFirstCell) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.2);
        doc.text(`${weekNum}ª SEM`, x + 1.5, y + 3.8);
      }

      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.roundedRect(x + w - 10.5, y + 1.6, 9, 5.8, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.text(String(entry.date.getDate()).padStart(2, '0'), x + w - 6, y + 5.9, { align: 'center' });

      doc.setDrawColor(accent[0], accent[1], accent[2]);
      doc.setLineWidth(0.4);
      doc.line(x, y + cellPaddingTop, x + w, y + cellPaddingTop);

      const contentBottom = y + h - 1;
      if (entry.items.length === 0) return state;

      const itemColumnWidth = (w - 5 - itemColumnGap) / 2;
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

        const rowsNeeded = Math.ceil(remainingItems.length / 2);
        const rowsToRender = Math.min(rowsNeeded, rowsThatFit);
        const itemsToRenderCount = Math.min(remainingItems.length, rowsToRender * 2);
        const blockHeight = 2.3 + titleHeight + rowsToRender * itemLineHeight + 0.8;

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

        for (let ri = 0; ri < rowsToRender; ri += 1) {
          const leftItem = remainingItems[ri * 2];
          const rightItem = remainingItems[ri * 2 + 1];
          const rowY = planLineY + ri * itemLineHeight + 0.35;
          if (leftItem) {
            doc.text(truncatePdfText(`• ${leftItem}`, itemColumnWidth), x + 2, rowY);
          }
          if (rightItem) {
            doc.text(truncatePdfText(`• ${rightItem}`, itemColumnWidth), x + 2 + itemColumnWidth + itemColumnGap, rowY);
          }
        }

        lineY += blockHeight + 0.35;
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

    const drawFooter = () => {
      const footerY = pageHeight - 7;
      doc.setDrawColor(209, 213, 219);
      doc.line(10, footerY - 3.2, pageWidth - 10, footerY - 3.2);
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Relatorio mensal de cardapio • Emissao: ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`,
        14,
        footerY
      );
    };

    const rowStates = calendarRows.map((row) => row.map(() => ({ planIndex: 0, itemOffset: 0 })));
    const hasRemainingContentInRange = (startRow: number, endRow: number) => {
      return calendarRows.slice(startRow, endRow).some((row, localRowIndex) => row.some((cell, colIndex) => {
        if (!cell.date || cell.items.length === 0) return false;
        return rowStates[startRow + localRowIndex][colIndex].planIndex < cell.items.length;
      }));
    };

    const gridStartY = tableStartY + colHeaderH;
    const maxCellHeight = 58;
    const minCellHeight = 16;
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

        drawPageHeader();
        drawTableColumnHeaders(tableStartY);

        let rowCursorY = gridStartY;
        for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
          const row = calendarRows[rowIndex];
          const localRowIndex = rowIndex - startRow;
          const cellH = rowHeights[localRowIndex];

          row.forEach((cell, colIndex) => {
            const cellX = marginX + colIndex * colW;
            rowStates[rowIndex][colIndex] = drawCalendarCellTable(
              cell,
              row[0]?.week || rowIndex + 1,
              colIndex === 0,
              cellX,
              rowCursorY,
              colW,
              cellH,
              rowStates[rowIndex][colIndex]
            );
          });
          rowCursorY += cellH;
        }

        drawTableGrid(gridStartY, rowHeights);
        drawFooter();
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

    const fileName = `cardapio_local_${selectedMonth}_${selectedEnterpriseName
      .toLowerCase()
      .replace(/\s+/g, '_')}_${type.toLowerCase()}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="dash-shell menu-shell min-h-screen space-y-3">
      {!activeEnterprise ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
            <p className="text-gray-600 font-medium">Carregando menu...</p>
          </div>
        </div>
      ) : (
      <>
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2 leading-none">
            <UtensilsCrossed className="text-indigo-600" size={18} />
            Grade Mensal
          </h1>
          <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em]">
            Defina o cardápio com base nos planos contratados • {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
          <button
            onClick={exportWeeklyCalendarPdf}
            className="px-3 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center gap-1.5"
          >
            <Calendar size={12} /> Baixar Calendario PDF
          </button>
          {isOwner && (
            <div className="relative group min-w-[240px]">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 group-hover:text-indigo-600 transition-colors">
                <Building size={18} />
              </div>
              <select 
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-white border border-transparent focus:border-indigo-500 rounded-lg shadow-sm outline-none font-black text-[9px] uppercase tracking-[0.12em] appearance-none cursor-pointer transition-all hover:shadow-md"
              >
                {enterprises.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <ChevronDown size={16} />
              </div>
            </div>
          )}
          
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5">
            <Save size={13} /> Publicar Grade
          </button>
        </div>
      </header>

      <section className="bg-white p-3 rounded-[18px] border shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.12em] mr-1">Mês:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthKey())}
            className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-black text-gray-700 uppercase tracking-[0.08em] outline-none focus:border-indigo-400"
          />
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.12em] ml-2">Duplicar para:</span>
          <input
            type="month"
            value={duplicateMonthTarget}
            onChange={(e) => setDuplicateMonthTarget(e.target.value || getNextMonthKey())}
            className="h-8 px-2 rounded-lg border border-emerald-200 text-[10px] font-black text-emerald-700 uppercase tracking-[0.08em] outline-none focus:border-emerald-400"
          />
          <button
            onClick={duplicateToMonth}
            className="h-8 px-3 bg-white border border-emerald-200 text-emerald-700 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] shadow-sm hover:bg-emerald-50 transition-all flex items-center justify-center gap-1.5"
          >
            <CalendarDays size={12} /> Duplicar Dados
          </button>
        </div>
      </section>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-pulse">
           <RefreshCw size={48} className="text-indigo-400 animate-spin" />
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-[4px]">Sincronizando grade mensal...</p>
        </div>
      ) : (
        <div className="space-y-3 animate-in fade-in duration-500">
          {activeServiceDays.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-5 text-center">
              <p className="text-[10px] font-black text-amber-700 uppercase tracking-[0.16em]">
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
            if (weekMenu.length === 0) return null;
            return (
              <section key={`week-grid-${week}`} className="space-y-1.5">
                <div className="px-1">
                  <h2 className="text-base md:text-lg font-black text-indigo-700 uppercase tracking-[0.16em]">{week}ª Semana</h2>
                </div>
                <div className="grid items-start grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
                  {weekMenu.map(day => {
                    const dayDate = getDateForWeekAndDay(selectedMonth, week, day.dayOfWeek as DayOfWeek);
                    const dayOfMonth = dayDate ? `${dayDate.getDate()}`.padStart(2, '0') : '--';
                    const isBlockedDay = dayDate ? !isSchoolDateAllowed(dayDate) : false;
                    const eventTitle = isBlockedDay ? (getSchoolEventTitle(dayDate) || 'Feriado/Recesso') : null;
                    const dayDropKey = `${week}-${day.id}`;

                    if (isBlockedDay) {
                      return (
                        <div key={`week-${week}-${day.id}`} className="flex flex-col self-start">
                          <div className="bg-rose-50 p-2.5 rounded-xl border-b-2 border-rose-300 shadow-sm">
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <h3 className="text-sm font-black text-rose-700 uppercase tracking-[0.12em]">{SHORT_DAY_LABEL[day.dayOfWeek as DayOfWeek]}</h3>
                                <p className="text-[10px] font-bold text-rose-400 uppercase">{dayOfMonth}</p>
                              </div>
                              <AlertTriangle size={14} className="text-rose-400 mt-0.5 shrink-0" />
                            </div>
                            <p className="mt-1.5 text-[9px] font-black text-rose-600 uppercase tracking-[0.06em] leading-tight" title={eventTitle!}>
                              {eventTitle}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
            <div key={`week-${week}-${day.id}`} className="flex flex-col gap-1.5 self-start">
              <div className="bg-white p-2.5 rounded-xl border-b-2 border-indigo-500 shadow-sm flex items-center justify-between gap-2">
                <div>
                   <h3 className="text-sm md:text-base font-black text-gray-800 uppercase tracking-[0.12em]">{day.dayOfWeek}</h3>
                   <p className="text-[10px] font-bold text-gray-400 uppercase">{day.items.length} Opções</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="min-w-[34px] h-8 px-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[16px] leading-none font-black flex items-center justify-center">
                    {dayOfMonth}
                  </span>
                  <button
                    onClick={() => toggleDayDuplicatePicker(week, day)}
                    className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-inner"
                    title="Duplicar dia"
                  >
                    <CalendarDays size={13} />
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
                    className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner"
                    title="Adicionar opção"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              {dayDuplicateTarget?.sourceWeek === week && dayDuplicateTarget?.sourceDayId === day.id && (
                <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-2.5 space-y-2">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.12em]">
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
                      className="h-8 rounded-lg border border-gray-200 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-700 focus:outline-none focus:border-emerald-400"
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
                      className="h-8 rounded-lg border border-gray-200 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-700 focus:outline-none focus:border-emerald-400"
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
                      className="px-3 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-700"
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
                <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-2.5 space-y-1.5">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.12em]">Escolha o plano para criar o cardápio</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={newItemPlanByDay[`${week}-${day.id}`] || ''}
                      onChange={(e) => {
                        const nextPlanId = e.target.value;
                        setNewItemPlanByDay((prev) => ({ ...prev, [`${week}-${day.id}`]: nextPlanId }));
                      }}
                      className="flex-1 h-8 rounded-lg border border-gray-200 px-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-gray-700 focus:outline-none focus:border-indigo-400"
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
                className={`rounded-2xl transition-all ${dragOverDayKey === dayDropKey ? 'ring-2 ring-indigo-300 ring-offset-1 bg-indigo-50/40' : ''}`}
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
                  <div className="bg-white/95 dark:bg-slate-900/60 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm divide-y divide-gray-100 dark:divide-slate-700 overflow-hidden">
                    {day.items.map(item => (
                      (() => {
                        const planColor = getPlanCardColor(item.planId, item.name);
                        return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggingMenuItem({ week, dayId: day.id, itemId: item.id })}
                        onDragEnd={() => {
                          setDraggingMenuItem(null);
                          setDragOverDayKey(null);
                        }}
                        className={`px-2.5 py-2 transition-colors group cursor-grab active:cursor-grabbing border-l-4 border-y border-r ${planColor.bg} ${planColor.border}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`text-[11px] font-black uppercase tracking-tight truncate ${planColor.title}`}>
                              {item.name}
                            </p>
                            {item.planId && (
                              <p className={`text-[9px] font-black uppercase tracking-[0.12em] mt-0.5 truncate ${planColor.badge}`}>
                                Plano: {plansCatalog.find((plan) => plan.id === item.planId)?.name || 'Plano vinculado'}
                              </p>
                            )}
                            {item.ingredients.length > 0 ? (
                              <ul className="mt-1 space-y-0.5">
                                {item.ingredients.map((ing) => (
                                  <li
                                    key={ing.id}
                                    className={`text-[11px] font-semibold leading-tight list-disc list-inside truncate ${planColor.text}`}
                                  >
                                    {ing.name}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className={`text-[11px] font-semibold leading-tight mt-0.5 ${planColor.text}`}>
                                {item.description?.trim() || 'Sem insumos definidos'}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`text-[11px] font-black whitespace-nowrap ${planColor.kcal}`}>
                              {calculateTotalNutrients(item.ingredients).calories} kcal
                            </p>
                            <div className="mt-1 flex items-center justify-end gap-1">
                              <button
                                onClick={() => toggleDayDuplicatePicker(week, day)}
                                className="p-1.5 bg-white/85 dark:bg-slate-900/65 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-300 rounded-lg"
                                title="Duplicar dia"
                              >
                                <CalendarDays size={13} />
                              </button>
                              <button
                                onClick={() => setEditingItem({ week, dayId: day.id, item })}
                                className="p-1.5 bg-white/85 dark:bg-slate-900/65 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 rounded-lg"
                                title="Editar ficha"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => removeItemFromDay(week, day.id, item.id)}
                                className="p-1.5 bg-white/85 dark:bg-slate-900/65 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-200 hover:text-red-500 dark:hover:text-rose-300 rounded-lg"
                                title="Remover opção"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                        );
                      })()
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

      {editingItem && (
        <div className="fixed inset-0 z-[600] flex justify-end animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm" onClick={() => setEditingItem(null)}></div>
           <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-500">
              
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
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Título do Cardápio</label>
                       <input 
                         value={editingItem.item.name}
                         onChange={(e) => setEditingItem({...editingItem, item: { ...editingItem.item, name: e.target.value }})}
                         className="w-full text-xl font-black text-gray-800 text-center bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-6 py-4 outline-none transition-all"
                         placeholder="Ex: Frango grelhado com arroz integral"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Descrição</label>
                       <textarea
                         value={editingItem.item.description || ''}
                         onChange={(e) => setEditingItem({...editingItem, item: { ...editingItem.item, description: e.target.value }})}
                         className="w-full min-h-[110px] text-sm font-bold text-gray-700 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 outline-none transition-all resize-none"
                         placeholder="Descreva o preparo, acompanhamentos e observações."
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Plano vinculado</label>
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
                        className="w-full h-12 rounded-2xl border border-gray-200 px-4 text-sm font-black text-gray-700 focus:outline-none focus:border-indigo-500 bg-white"
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
                       <h3 className="text-xs font-black text-gray-800 uppercase tracking-[2px] flex items-center gap-2">
                          <Utensils size={18} className="text-indigo-600" /> Componentes e Insumos
                       </h3>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monte os insumos por item</p>
                    </div>

                    <div className="space-y-4">
                       <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4">
                         <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                           <div className="md:col-span-7 relative">
                             <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1">Nome do item</label>
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
                               className="mt-1 w-full bg-white border-2 border-transparent focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 outline-none"
                               placeholder="Digite para buscar na base nutricional..."
                             />
                             {isQuickIngredientListOpen && (
                               <div className="absolute z-[710] left-0 right-0 mt-1 bg-white border border-indigo-100 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                                 {isLoadingQuickIngredientSuggestions && (
                                   <div className="px-3 py-2 text-[11px] font-semibold text-gray-500">
                                     Buscando insumos...
                                   </div>
                                 )}
                                 {!isLoadingQuickIngredientSuggestions && quickIngredientSuggestions.length === 0 && quickIngredientQuery.trim() && (
                                   <div className="px-3 py-2 text-[11px] font-semibold text-gray-500">
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
                                     className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${quickIngredientSuggestions[quickIngredientHighlightedIndex]?.id === item.id ? 'bg-indigo-100' : 'hover:bg-indigo-50'}`}
                                   >
                                     <p className="text-xs font-black text-gray-800 uppercase">{item.name}</p>
                                     <p className="text-[10px] font-semibold text-gray-500">{item.calories} kcal • {item.proteins}P • {item.carbs}C • {item.fats}G (base 100{item.unit})</p>
                                   </button>
                                 ))}
                               </div>
                             )}
                           </div>
                           <div className="md:col-span-2">
                             <div className="flex items-center gap-2 ml-1 mb-1">
                               <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Qtd/gramagem</label>
                               <button
                                 type="button"
                                 onClick={() => setQuickIngredientGramsEnabled((v) => !v)}
                                 className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                                   quickIngredientGramsEnabled ? 'bg-indigo-500' : 'bg-gray-300'
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
                               className={`w-full bg-white border-2 border-transparent focus:border-indigo-400 rounded-xl px-3 py-2.5 text-sm font-black outline-none transition-opacity ${
                                 quickIngredientGramsEnabled ? 'text-gray-700 opacity-100' : 'text-gray-400 opacity-40 cursor-not-allowed'
                               }`}
                               placeholder="100"
                             />
                           </div>
                           <div className="md:col-span-3 flex items-end">
                             <button
                               type="button"
                               onClick={() => addIngredientFromQuickForm()}
                               className="w-full text-[10px] font-black text-indigo-600 bg-white px-4 py-3 rounded-xl hover:bg-indigo-600 hover:text-white transition-all uppercase tracking-widest border border-indigo-200 flex items-center justify-center gap-2"
                             >
                               <Plus size={15} /> Adicionar à Lista
                             </button>
                           </div>
                         </div>
                       </div>

                       {editingItem.item.ingredients.length === 0 ? (
                         <div className="text-center py-16 bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-200">
                            <Info size={40} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhum componente vinculado a esta opção</p>
                         </div>
                       ) : (
                         <div className="space-y-2">
                           {editingItem.item.ingredients.map((ing) => (
                             <div key={ing.id} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                               <div className="flex items-center justify-between gap-3">
                                 <div className="min-w-0">
                                   <p className="text-sm font-black text-gray-800 truncate">{ing.name}</p>
                                   <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
                                     {Number(ing.calories || 0).toFixed(1)} kcal • P {Number(ing.proteins || 0).toFixed(1)}g • C {Number(ing.carbs || 0).toFixed(1)}g • G {Number(ing.fats || 0).toFixed(1)}g
                                   </p>
                                 </div>
                                 <div className="shrink-0 flex items-center gap-2">
                                   <button
                                     onClick={() => toggleIngredientReplicatePicker(ing.id)}
                                     className="h-8 px-3 bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                                     title="Repetir ingrediente em outros dias"
                                   >
                                     <CalendarDays size={13} /> Repetir
                                   </button>
                                   <button
                                     onClick={() => removeIngredient(ing.id)}
                                     className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                     title="Remover item"
                                   >
                                     <Trash2 size={18} />
                                   </button>
                                 </div>
                               </div>
                               {ingredientReplicateTargetId === ing.id && (
                                 <div className="mt-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                                     Repetir este item em:
                                   </p>
                                   <div className="grid grid-cols-3 gap-2">
                                     {DAYS_OF_WEEK.map((dayKey) => {
                                       const isCurrentDay = dayKey === editingDayLabel;
                                       const checked = ingredientReplicateDays.includes(dayKey);
                                       return (
                                         <label
                                           key={dayKey}
                                           className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-1.5 rounded-lg ${isCurrentDay ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-gray-600 border border-gray-200 cursor-pointer'}`}
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
                                       className="px-3 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-700"
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
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/90 backdrop-blur-md border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.05)] z-[600]">
                 <div className="flex flex-col">
                    <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${canSaveFicha ? 'text-emerald-600' : 'text-amber-500'}`}>
                       {canSaveFicha ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>} 
                       {canSaveFicha ? 'Pronto para salvar' : 'Ação Necessária'}
                    </p>
                    <p className="text-[8px] font-bold text-gray-400 uppercase mt-1 leading-relaxed">
                       {!editingItem?.item.name?.trim() ? '• Informe um título. ' : ''}
                       {editingItem?.item.ingredients.length === 0 ? '• Adicione pelo menos 1 componente.' : ''}
                    </p>
                 </div>
                 <div className="flex gap-4 w-full sm:w-auto">
                    <button onClick={() => setEditingItem(null)} className="px-10 py-5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Cancelar</button>
                    <button 
                      onClick={saveEditingItem} 
                      disabled={!canSaveFicha}
                      className={`flex-1 sm:flex-none px-14 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest shadow-2xl transition-all flex items-center justify-center gap-3 ${
                        canSaveFicha 
                          ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700 active:scale-95' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
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
