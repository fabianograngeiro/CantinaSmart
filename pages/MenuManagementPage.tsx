import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, Trash2, Save,
  Info, Calendar,
  UtensilsCrossed, X, CheckCircle2,
  Building, ChevronDown, RefreshCw, Utensils,
  Edit3, Clock, AlertCircle, CalendarDays
} from 'lucide-react';
import { MenuDay, MenuItem, Ingredient, User, Enterprise, Role, Plan } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';

const DAYS_OF_WEEK: ('SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO')[] = [
  'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'
];
const SHORT_DAY_LABEL: Record<(typeof DAYS_OF_WEEK)[number], string> = {
  SEGUNDA: 'SEG',
  TERCA: 'TER',
  QUARTA: 'QUA',
  QUINTA: 'QUI',
  SEXTA: 'SEX',
  SABADO: 'SAB',
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
        setIngredientsCatalog(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Erro ao carregar insumos:', err);
        setIngredientsCatalog([]);
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

  const [weeklyMenu, setWeeklyMenu] = useState<MenuDay[]>(generateInitialMenu());
  const [menuLoaded, setMenuLoaded] = useState(false);

  const isOwner = currentUser.role === Role.OWNER;

  useEffect(() => {
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

    const loadWeeklyMenu = async () => {
      if (!selectedUnitId) {
        setWeeklyMenu(generateInitialMenu());
        setMenuLoaded(false);
        return;
      }

      setMenuLoaded(false);
      setIsLoading(true);
      try {
        const payload = await ApiService.getWeeklyMenu(selectedUnitId, type);
        const nextDays = normalizeMenuDays(payload?.days || []);
        setWeeklyMenu(nextDays);
      } catch (error) {
        console.error('Erro ao carregar cardápio semanal:', error);
        setWeeklyMenu(generateInitialMenu());
      } finally {
        setMenuLoaded(true);
        setIsLoading(false);
      }
    };

    loadWeeklyMenu();
  }, [selectedUnitId, type]);

  useEffect(() => {
    if (!menuLoaded || !selectedUnitId) return;
    const timer = setTimeout(async () => {
      try {
        await ApiService.saveWeeklyMenu(selectedUnitId, type, weeklyMenu);
      } catch (error) {
        console.error('Erro ao salvar cardápio semanal:', error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [weeklyMenu, selectedUnitId, type, menuLoaded]);

  const [editingItem, setEditingItem] = useState<{ dayId: string, item: MenuItem } | null>(null);
  const [quickIngredientQuery, setQuickIngredientQuery] = useState('');
  const [quickIngredientWeight, setQuickIngredientWeight] = useState('100');
  const [isQuickIngredientListOpen, setIsQuickIngredientListOpen] = useState(false);
  const [quickIngredientSuggestions, setQuickIngredientSuggestions] = useState<Ingredient[]>([]);
  const [isLoadingQuickIngredientSuggestions, setIsLoadingQuickIngredientSuggestions] = useState(false);
  const [openPlanPickerDayId, setOpenPlanPickerDayId] = useState<string | null>(null);
  const [newItemPlanByDay, setNewItemPlanByDay] = useState<Record<string, string>>({});
  const [itemReplicateTarget, setItemReplicateTarget] = useState<{ dayId: string; itemId: string } | null>(null);
  const [itemReplicateDays, setItemReplicateDays] = useState<(typeof DAYS_OF_WEEK)[number][]>([]);
  const [ingredientReplicateTargetId, setIngredientReplicateTargetId] = useState<string | null>(null);
  const [ingredientReplicateDays, setIngredientReplicateDays] = useState<(typeof DAYS_OF_WEEK)[number][]>([]);

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

  const addItemToDay = (dayId: string, planId?: string) => {
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
    setWeeklyMenu(prev => prev.map(d => d.id === dayId ? { ...d, items: [...d.items, newItem] } : d));
    setEditingItem({ dayId, item: newItem });
    setOpenPlanPickerDayId(null);
  };

  const removeItemFromDay = (dayId: string, itemId: string) => {
    if (window.confirm("Deseja remover este cardápio permanentemente?")) {
      setWeeklyMenu(prev => prev.map(d => d.id === dayId ? { ...d, items: d.items.filter(i => i.id !== itemId) } : d));
    }
  };

  const toggleItemReplicatePicker = (
    dayId: string,
    itemId: string,
    currentDayOfWeek: (typeof DAYS_OF_WEEK)[number]
  ) => {
    const isSameTarget = itemReplicateTarget?.dayId === dayId && itemReplicateTarget?.itemId === itemId;
    if (isSameTarget) {
      setItemReplicateTarget(null);
      setItemReplicateDays([]);
      return;
    }
    setItemReplicateTarget({ dayId, itemId });
    setItemReplicateDays([currentDayOfWeek]);
  };

  const applyItemReplication = () => {
    if (!itemReplicateTarget) return;
    const { dayId, itemId } = itemReplicateTarget;
    if (itemReplicateDays.length === 0) return;

    const dayNamesApplied: string[] = [];

    setWeeklyMenu((prev) => {
      const sourceDay = prev.find((day) => day.id === dayId);
      const sourceItem = sourceDay?.items.find((item) => item.id === itemId);
      if (!sourceDay || !sourceItem) return prev;

      return prev.map((day) => {
        if (!itemReplicateDays.includes(day.dayOfWeek)) {
          return day;
        }
        if (day.id === sourceDay.id) {
          dayNamesApplied.push(day.dayOfWeek);
          return day;
        }
        const alreadyExists = day.items.some((item) => {
          const sameName = String(item.name || '').trim().toLowerCase() === String(sourceItem.name || '').trim().toLowerCase();
          const samePlan = String(item.planId || '') === String(sourceItem.planId || '');
          return sameName && samePlan;
        });
        if (alreadyExists) return day;

        const replicatedItem: MenuItem = {
          ...sourceItem,
          id: Math.random().toString(36).substr(2, 9),
          ingredients: sourceItem.ingredients.map((ing) => ({ ...ing, id: Math.random().toString(36).substr(2, 9) })),
        };
        dayNamesApplied.push(day.dayOfWeek);
        return { ...day, items: [...day.items, replicatedItem] };
      });
    });

    if (dayNamesApplied.length > 0) {
      notificationService.informativo(
        'Item replicado',
        `Item adicionado com sucesso em: ${dayNamesApplied.map((day) => SHORT_DAY_LABEL[day as keyof typeof SHORT_DAY_LABEL] || day).join(', ')}.`
      );
    }
    setItemReplicateTarget(null);
    setItemReplicateDays([]);
  };

  const toggleIngredientReplicatePicker = (ingredientId: string) => {
    if (!editingItem) return;
    if (ingredientReplicateTargetId === ingredientId) {
      setIngredientReplicateTargetId(null);
      setIngredientReplicateDays([]);
      return;
    }
    setIngredientReplicateTargetId(ingredientId);
    const currentDay = weeklyMenu.find((day) => day.id === editingItem.dayId)?.dayOfWeek;
    setIngredientReplicateDays(currentDay ? [currentDay] : []);
  };

  const applyIngredientReplication = () => {
    if (!editingItem || !ingredientReplicateTargetId || ingredientReplicateDays.length === 0) return;

    const sourceIngredient = editingItem.item.ingredients.find((ing) => ing.id === ingredientReplicateTargetId);
    if (!sourceIngredient) return;

    const sourceDay = weeklyMenu.find((day) => day.id === editingItem.dayId);
    if (!sourceDay) return;

    const appliedDays: string[] = [];

    setWeeklyMenu((prev) => prev.map((day) => {
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

    const timer = setTimeout(async () => {
      try {
        const results = await ApiService.searchIngredients(term, 10);
        if (!isCancelled) {
          setQuickIngredientSuggestions(Array.isArray(results) ? results : []);
        }
      } catch (error) {
        if (!isCancelled) {
          // Fallback local para manter o fluxo mesmo sem backend de busca
          const localResults = ingredientsCatalog
            .filter((item) => String(item.name || '').toLowerCase().includes(term.toLowerCase()))
            .slice(0, 10);
          setQuickIngredientSuggestions(localResults);
        }
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

  const addIngredientFromQuickForm = (catalogIngredient?: Ingredient) => {
    if (!editingItem) return;
    const query = String(quickIngredientQuery || '').trim();
    if (!query) return;

    const resolvedIngredient = catalogIngredient
      || ingredientsCatalog.find((item) => String(item.name || '').trim().toLowerCase() === query.toLowerCase())
      || ingredientsCatalog.find((item) => String(item.name || '').trim().toLowerCase().includes(query.toLowerCase()));

    const weight = Math.max(1, Number(quickIngredientWeight || 0) || 100);
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
      name: `${base.name} (${suffix})`,
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
    setWeeklyMenu(prev => prev.map(d => 
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
    return weeklyMenu.find((day) => day.id === editingItem.dayId)?.dayOfWeek || '';
  }, [editingItem, weeklyMenu]);
  const selectedPlanName = useMemo(() => {
    if (!editingItem?.item?.planId) return '';
    return plansCatalog.find((plan) => plan.id === editingItem.item.planId)?.name || '';
  }, [editingItem, plansCatalog]);

  const selectedEnterpriseName = enterprises.find(ent => ent.id === selectedUnitId)?.name || activeEnterprise?.name || 'Unidade';

  const exportWeeklyCalendarPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedAt = new Date();
    const days = weeklyMenu.map((day) => day.dayOfWeek);
    const dayHeaderColors: [number, number, number][] = [
      [30, 58, 138],   // SEG
      [37, 99, 235],   // TER
      [79, 70, 229],   // QUA
      [22, 163, 74],   // QUI
      [245, 158, 11],  // SEX
      [124, 58, 237],  // SAB
    ];
    const getPlanPalette = (rawName: string) => {
      const name = String(rawName || '').toUpperCase();
      if (name.includes('ALMO')) {
        return {
          badge: [37, 99, 235] as [number, number, number],
          cardBg: [239, 246, 255] as [number, number, number],
          border: [147, 197, 253] as [number, number, number],
          text: [30, 58, 138] as [number, number, number],
        };
      }
      if (name.includes('LANCHE')) {
        return {
          badge: [245, 158, 11] as [number, number, number],
          cardBg: [255, 251, 235] as [number, number, number],
          border: [252, 211, 77] as [number, number, number],
          text: [146, 64, 14] as [number, number, number],
        };
      }
      if (name.includes('KIDS')) {
        return {
          badge: [236, 72, 153] as [number, number, number],
          cardBg: [253, 242, 248] as [number, number, number],
          border: [244, 114, 182] as [number, number, number],
          text: [157, 23, 77] as [number, number, number],
        };
      }
      if (name.includes('FIT') || name.includes('SAUD')) {
        return {
          badge: [16, 185, 129] as [number, number, number],
          cardBg: [236, 253, 245] as [number, number, number],
          border: [110, 231, 183] as [number, number, number],
          text: [6, 95, 70] as [number, number, number],
        };
      }
      if (name.includes('PREMIUM') || name.includes('ESPECIAL')) {
        return {
          badge: [124, 58, 237] as [number, number, number],
          cardBg: [245, 243, 255] as [number, number, number],
          border: [167, 139, 250] as [number, number, number],
          text: [76, 29, 149] as [number, number, number],
        };
      }
      return {
        badge: [79, 70, 229] as [number, number, number],
        cardBg: [243, 244, 246] as [number, number, number],
        border: [209, 213, 219] as [number, number, number],
        text: [31, 41, 55] as [number, number, number],
      };
    };

    const tableRows = [weeklyMenu.map(() => '')];

    // Header premium
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 28, 'F');
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 8, 15, 15, 2.5, 2.5, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CA', 16.2, 17.8);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CALENDARIO DE CARDAPIO LOCAL', 33, 14.5);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(String(selectedEnterpriseName || 'CANTINA ALFA').toUpperCase(), 33, 20.5);

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.2);
    doc.text(`Cardapio Semanal | Unidade: ${selectedEnterpriseName} | Refeicao: ${type === 'ALMOCO' ? 'Almoco' : 'Lanche'}`, 14, 35);
    doc.text(
      `Gerado em: ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`,
      205,
      35
    );
    doc.setDrawColor(229, 231, 235);
    doc.line(10, 38, 287, 38);

    autoTable(doc, {
      startY: 42,
      head: [days],
      body: tableRows,
      styles: {
        fontSize: 8.2,
        cellPadding: 3.2,
        valign: 'top',
        halign: 'left',
        overflow: 'linebreak',
        lineColor: [241, 245, 249],
        lineWidth: 0,
        minCellHeight: 110,
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        minCellHeight: 12.8,
      },
      theme: 'plain',
      margin: { left: 10, right: 10, top: 42, bottom: 20 },
      didParseCell: (data) => {
        if (data.section === 'head') {
          const color = dayHeaderColors[data.column.index] || [30, 58, 138];
          data.cell.styles.fillColor = color;
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.section === 'body') {
          data.cell.text = [''];
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;

        const day = weeklyMenu[data.column.index];
        if (!day) return;

        const x = data.cell.x + 1.5;
        const y = data.cell.y + 2;
        const w = data.cell.width - 3;
        const h = data.cell.height - 4;

        let cursorY = y;
        const cardGap = 2;

        if (!day.items.length) {
          // vazio também em formato de card (sem texto solto)
          doc.setFillColor(249, 250, 251);
          doc.setDrawColor(209, 213, 219);
          doc.roundedRect(x, cursorY, w, 18, 1.5, 1.5, 'FD');
          doc.setFontSize(8.5);
          doc.setTextColor(156, 163, 175);
          doc.setFont('helvetica', 'italic');
          doc.text('Sem cardapio', x + 3, cursorY + 10);
          doc.setFont('helvetica', 'normal');
          return;
        }

        for (let i = 0; i < day.items.length; i += 1) {
          const item = day.items[i];
          const palette = getPlanPalette(item.name || '');
          const badgeText = String(item.name || 'CARDAPIO').toUpperCase();
          const description = String(item.description || '').trim();
          const ingredients = item.ingredients.length
            ? item.ingredients.map((ing) => ing.name)
            : ['Composicao nao definida'];

          // Estimate card height
          const ingredientLines: string[] = [];
          ingredients.forEach((ingredient) => {
            const wrapped = doc.splitTextToSize(`${ingredient}`, w - 8);
            ingredientLines.push(...wrapped.slice(0, 2));
          });

          const maxIngredientLines = 8;
          const visibleIngredientLines = ingredientLines.slice(0, maxIngredientLines);
          const hiddenCount = ingredientLines.length - visibleIngredientLines.length;
          const hasDescription = Boolean(description);
          const cardHeight = (hasDescription ? 22 : 18) + visibleIngredientLines.length * 3 + (hiddenCount > 0 ? 3 : 0);

          if (cursorY + cardHeight > y + h) {
            // evita texto solto fora do bloco
            break;
          }

          // Card container (premium: branco com barra lateral)
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(x, cursorY, w, cardHeight, 2, 2, 'FD');
          doc.setFillColor(palette.badge[0], palette.badge[1], palette.badge[2]);
          doc.roundedRect(x, cursorY, 1.8, cardHeight, 1, 1, 'F');

          // Badge (etiqueta colorida)
          doc.setFillColor(palette.cardBg[0], palette.cardBg[1], palette.cardBg[2]);
          doc.setDrawColor(palette.border[0], palette.border[1], palette.border[2]);
          const badgeWidth = Math.min(w - 6, 34);
          doc.roundedRect(x + 3, cursorY + 1.8, badgeWidth, 5.2, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.4);
          doc.setTextColor(palette.text[0], palette.text[1], palette.text[2]);
          const badgeWrapped = doc.splitTextToSize(badgeText, badgeWidth - 2).slice(0, 1);
          doc.text(badgeWrapped[0], x + 4.2, cursorY + 5.6);

          // Description
          let ingredientsTitleY = cursorY + 10.7;
          if (hasDescription) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.6);
            doc.setTextColor(107, 114, 128);
            const descLine = doc.splitTextToSize(description, w - 8).slice(0, 1);
            doc.text(descLine[0], x + 3, cursorY + 10.7);
            ingredientsTitleY = cursorY + 14.2;
          }

          // Ingredients title
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(palette.text[0], palette.text[1], palette.text[2]);
          doc.text('Insumos:', x + 3, ingredientsTitleY);

          // Ingredients list with subtle circle marker
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(55, 65, 81);
          let lineY = ingredientsTitleY + 3;
          visibleIngredientLines.forEach((line) => {
            doc.setFillColor(148, 163, 184);
            doc.circle(x + 4.2, lineY - 0.9, 0.45, 'F');
            doc.text(line, x + 5.4, lineY);
            lineY += 3;
          });
          if (hiddenCount > 0) {
            doc.setFontSize(7);
            doc.setTextColor(107, 114, 128);
            doc.text(`+${hiddenCount} item(ns)`, x + 2.8, lineY);
          }

          cursorY += cardHeight + cardGap;
        }
      },
    });

    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setDrawColor(209, 213, 219);
    doc.line(10, footerY - 4, 287, footerY - 4);
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8.2);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Sujeito a alteracoes conforme disponibilidade de estoque • Emissao: ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`,
      14,
      footerY
    );

    const fileName = `cardapio_local_${selectedEnterpriseName
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
            Grade Semanal: Cardápio da Semana
          </h1>
          <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em]">
            Defina o cardápio com base nos planos contratados
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

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-pulse">
           <RefreshCw size={48} className="text-indigo-400 animate-spin" />
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-[4px]">Sincronizando cardápio semanal...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 animate-in fade-in duration-500">
          {weeklyMenu.map(day => (
            <div key={day.id} className="flex flex-col gap-2.5">
              <div className="bg-white p-3 rounded-xl border-b-2 border-indigo-500 shadow-sm flex items-center justify-between gap-2">
                <div>
                   <h3 className="text-[10px] font-black text-gray-800 uppercase tracking-[0.12em]">{day.dayOfWeek}</h3>
                   <p className="text-[8px] font-bold text-gray-400 uppercase">{day.items.length} Opções</p>
                </div>
                <button 
                  onClick={() => {
                    if (plansCatalog.length === 0) {
                      addItemToDay(day.id);
                      return;
                    }
                    setOpenPlanPickerDayId((prev) => prev === day.id ? null : day.id);
                    setNewItemPlanByDay((prev) => ({
                      ...prev,
                      [day.id]: prev[day.id] || plansCatalog[0]?.id || '',
                    }));
                  }}
                  className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner"
                  title="Adicionar opção"
                >
                  <Plus size={14} />
                </button>
              </div>
              {openPlanPickerDayId === day.id && (
                <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-2.5 space-y-1.5">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.12em]">Escolha o plano para criar o cardápio</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={newItemPlanByDay[day.id] || ''}
                      onChange={(e) => {
                        const nextPlanId = e.target.value;
                        setNewItemPlanByDay((prev) => ({ ...prev, [day.id]: nextPlanId }));
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
                      onClick={() => addItemToDay(day.id, newItemPlanByDay[day.id])}
                      className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.12em] hover:bg-indigo-700"
                    >
                      Criar
                    </button>
                  </div>
                </div>
              )}

              <div className="min-h-[250px]">
                {day.items.length === 0 ? (
                  <div className="h-full border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center p-5 text-center opacity-40">
                     <Clock size={18} className="mb-2" />
                     <p className="text-[8px] font-black uppercase">Sem Itens</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
                    {day.items.map(item => (
                      <div
                        key={item.id}
                        className="px-2.5 py-2 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-gray-800 uppercase tracking-tight truncate">
                              {item.name}
                            </p>
                            {item.planId && (
                              <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.12em] mt-0.5 truncate">
                                Plano: {plansCatalog.find((plan) => plan.id === item.planId)?.name || 'Plano vinculado'}
                              </p>
                            )}
                            {item.ingredients.length > 0 ? (
                              <ul className="mt-1 space-y-0.5">
                                {item.ingredients.slice(0, 5).map((ing) => (
                                  <li
                                    key={ing.id}
                                    className="text-[11px] font-semibold text-gray-500 leading-tight list-disc list-inside truncate"
                                  >
                                    {ing.name}
                                  </li>
                                ))}
                                {item.ingredients.length > 5 && (
                                  <li className="text-[10px] font-bold text-gray-400 leading-tight list-none pl-4">
                                    +{item.ingredients.length - 5} item(ns)
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <p className="text-[11px] font-semibold text-gray-500 leading-tight mt-0.5">
                                {item.description?.trim() || 'Sem insumos definidos'}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] font-black text-amber-600 whitespace-nowrap">
                              {calculateTotalNutrients(item.ingredients).calories} kcal
                            </p>
                            <div className="mt-1 flex items-center justify-end gap-1">
                              <button
                                onClick={() => setEditingItem({ dayId: day.id, item })}
                                className="p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-indigo-600 rounded-lg"
                                title="Editar ficha"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => removeItemFromDay(day.id, item.id)}
                                className="p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-red-500 rounded-lg"
                                title="Remover opção"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-indigo-100">
                          <button
                            onClick={() => toggleItemReplicatePicker(day.id, item.id, day.dayOfWeek)}
                            className="w-full h-8 bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                            title="Repetir em outros dias"
                          >
                            <CalendarDays size={13} /> Repetir item em outros dias
                          </button>
                        </div>
                        {itemReplicateTarget?.dayId === day.id && itemReplicateTarget?.itemId === item.id && (
                          <div className="mt-2 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                              Repetir este item em:
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {DAYS_OF_WEEK.map((dayKey) => {
                                const isCurrentDay = dayKey === day.dayOfWeek;
                                const checked = itemReplicateDays.includes(dayKey);
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
                                        setItemReplicateDays((prev) => {
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
                                  setItemReplicateTarget(null);
                                  setItemReplicateDays([]);
                                }}
                                className="px-3 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-700"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={applyItemReplication}
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
          ))}
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
                                 setTimeout(() => setIsQuickIngredientListOpen(false), 120);
                               }}
                               onChange={(e) => {
                                 setQuickIngredientQuery(e.target.value);
                                 setIsQuickIngredientListOpen(true);
                               }}
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                   e.preventDefault();
                                   if (quickIngredientSuggestions.length > 0) {
                                     addIngredientFromQuickForm(quickIngredientSuggestions[0]);
                                   } else {
                                     addIngredientFromQuickForm();
                                   }
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
                                     onClick={() => addIngredientFromQuickForm(item)}
                                     className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-indigo-50"
                                   >
                                     <p className="text-xs font-black text-gray-800 uppercase">{item.name}</p>
                                     <p className="text-[10px] font-semibold text-gray-500">{item.calories} kcal • {item.proteins}P • {item.carbs}C • {item.fats}G (base 100{item.unit})</p>
                                   </button>
                                 ))}
                               </div>
                             )}
                           </div>
                           <div className="md:col-span-2">
                             <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1">Qtd/gramagem</label>
                             <input
                               type="number"
                               min={1}
                               value={quickIngredientWeight}
                               onChange={(e) => setQuickIngredientWeight(e.target.value)}
                               className="mt-1 w-full bg-white border-2 border-transparent focus:border-indigo-400 rounded-xl px-3 py-2.5 text-sm font-black text-gray-700 outline-none"
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
                                     title="Repetir item em outros dias"
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
