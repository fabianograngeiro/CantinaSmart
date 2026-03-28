import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Download, Share2, Mail,
  Smartphone, Copy, Check, Utensils, Leaf, Heart, Clock,
  AlertCircle, Loader2
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Enterprise, MenuItem } from '../types';
import notificationService from '../services/notificationService';
import { extractSchoolCalendarOperationalData } from '../utils/schoolCalendar';

interface MenuCalendarPageProps {
  activeEnterprise?: Enterprise;
  currentUser?: any;
}

type DayOfWeek = 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO';
const DAY_LABELS: Record<DayOfWeek, string> = {
  'SEGUNDA': 'Segunda',
  'TERCA': 'Terça',
  'QUARTA': 'Quarta',
  'QUINTA': 'Quinta',
  'SEXTA': 'Sexta',
  'SABADO': 'Sábado'
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

interface MenuDay {
  dayOfWeek: DayOfWeek;
  items: MenuItem[];
}

const WEEK_OPTIONS = [1, 2, 3, 4, 5] as const;
const DAY_OF_WEEK_TO_JS: Record<DayOfWeek, number> = {
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};

const normalizeMenuDays = (rawDays: any[]): MenuDay[] => {
  const list = Array.isArray(rawDays) ? rawDays : [];
  const byDay = new Map(
    list
      .filter((day) => day && typeof day.dayOfWeek === 'string')
      .map((day) => [String(day.dayOfWeek).toUpperCase(), day])
  );

  return (Object.keys(DAY_LABELS) as DayOfWeek[]).map((dayOfWeek) => {
    const source = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      items: Array.isArray(source?.items) ? source.items : [],
    };
  });
};

const resolveMonthWeekIndexForDate = (date: Date, dayOfWeek: DayOfWeek): number => {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstJsDay = firstDay.getDay();
  const targetJsDay = DAY_OF_WEEK_TO_JS[dayOfWeek];
  const firstOccurrenceDay = 1 + ((targetJsDay - firstJsDay + 7) % 7);
  const weekIndex = Math.floor((date.getDate() - firstOccurrenceDay) / 7) + 1;
  return Math.max(1, Math.min(5, weekIndex));
};

const mapDateToMenuDayOfWeek = (jsDay: number): DayOfWeek | null => {
  if (jsDay === 1) return 'SEGUNDA';
  if (jsDay === 2) return 'TERCA';
  if (jsDay === 3) return 'QUARTA';
  if (jsDay === 4) return 'QUINTA';
  if (jsDay === 5) return 'SEXTA';
  if (jsDay === 6) return 'SABADO';
  return null;
};

interface CalendarDay {
  date: number | null;
  dayOfWeek?: DayOfWeek;
  items?: MenuItem[];
  isOtherMonth: boolean;
  dateKey?: string;
  isBlocked?: boolean;
  blockedTitle?: string;
}

const MenuCalendarPage: React.FC<MenuCalendarPageProps> = ({ activeEnterprise, currentUser }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [menusByWeek, setMenusByWeek] = useState<Record<number, MenuDay[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [schoolCalendarBlockedDates, setSchoolCalendarBlockedDates] = useState<string[]>([]);
  const [schoolCalendarEventByDate, setSchoolCalendarEventByDate] = useState<Record<string, string>>({});

  const hashQuery = String(window.location.hash || '').split('?')[1] || '';
  const queryEnterpriseId = new URLSearchParams(hashQuery).get('enterprise') || '';

  const enterpriseId = activeEnterprise?.id || queryEnterpriseId;
  const enterpriseName = activeEnterprise?.name || 'Nossa Cantina';

  useEffect(() => {
    const [yearRaw] = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`.split('-');
    const schoolYear = Number(yearRaw);

    if (!enterpriseId || !Number.isFinite(schoolYear)) {
      setSchoolCalendarBlockedDates([]);
      setSchoolCalendarEventByDate({});
      return;
    }

    let cancelled = false;

    const loadSchoolCalendar = async () => {
      try {
        const payload = await ApiService.getSchoolCalendar(enterpriseId, schoolYear);
        if (cancelled) return;
        const extracted = extractSchoolCalendarOperationalData(payload, schoolYear);
        setSchoolCalendarBlockedDates(extracted.blockedDates || []);
        setSchoolCalendarEventByDate(extracted.eventTitlesByDate || {});
      } catch (error) {
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
  }, [enterpriseId, currentMonth]);

  // Carregar menus quando o mês mudar
  useEffect(() => {
    const loadMenus = async () => {
      if (!enterpriseId) {
        setMenusByWeek({});
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
        const responses = await Promise.all(
          WEEK_OPTIONS.map(async (weekIndex) => {
            const data = await ApiService.getWeeklyMenu(enterpriseId, 'ALMOCO', weekIndex, monthKey);
            return [weekIndex, normalizeMenuDays(data?.days || [])] as const;
          })
        );
        const nextMap = responses.reduce((acc, [week, days]) => {
          acc[week] = days;
          return acc;
        }, {} as Record<number, MenuDay[]>);
        setMenusByWeek(nextMap);
      } catch (err) {
        console.error('Erro ao carregar cardápio:', err);
        notificationService.alerta('Erro', 'Não foi possível carregar o cardápio');
        setMenusByWeek({});
      } finally {
        setIsLoading(false);
      }
    };

    loadMenus();
  }, [currentMonth, enterpriseId]);

  // Construir calendário com itens de menu
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const blockedDateSet = new Set(schoolCalendarBlockedDates);
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
    
    const calendar: CalendarDay[] = [];
    
    // Dias do mês anterior
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek; i > 0; i--) {
      calendar.push({
        date: prevMonthLastDay - i + 1,
        isOtherMonth: true
      });
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeekNum = date.getDay(); // 0-6 (0=domingo)

      const dayOfWeek = mapDateToMenuDayOfWeek(dayOfWeekNum);
      const weekIndex = dayOfWeek ? resolveMonthWeekIndexForDate(date, dayOfWeek) : 1;
      const weekMenu = dayOfWeek ? (menusByWeek[weekIndex] || []) : [];
      const menuDay = dayOfWeek ? weekMenu.find((m) => m.dayOfWeek === dayOfWeek) : null;
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const isBlocked = blockedDateSet.has(dateKey);
      
      calendar.push({
        date: day,
        dayOfWeek: dayOfWeek || undefined,
        items: isBlocked ? [] : (menuDay?.items || []),
        isOtherMonth: false,
        dateKey,
        isBlocked,
        blockedTitle: isBlocked ? (schoolCalendarEventByDate[dateKey] || 'Dia sem funcionamento') : undefined,
      });
    }
    
    // Preencher com dias do próximo mês até completar semanas
    const remainingDays = 42 - calendar.length; // 6 semanas completas
    for (let i = 1; i <= remainingDays; i++) {
      calendar.push({
        date: i,
        isOtherMonth: true
      });
    }
    
    return calendar;
  }, [currentMonth, menusByWeek, schoolCalendarBlockedDates, schoolCalendarEventByDate]);

  const visibleCalendarDays = useMemo(
    () => calendarDays.filter((day) => !day.isOtherMonth && !day.isBlocked && Array.isArray(day.items) && day.items.length > 0),
    [calendarDays]
  );

  // Função para copiar link
  const copyLinkToClipboard = () => {
    const url = `${window.location.origin}/#/menu-calendar?enterprise=${enterpriseId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      notificationService.informativo('Copiado!', 'Link do cardápio copiado para a área de transferência');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Função para compartilhar por WhatsApp
  const shareWhatsApp = () => {
    const url = `${window.location.origin}/#/menu-calendar?enterprise=${enterpriseId}`;
    const text = encodeURIComponent(
      `Confira nosso cardápio de ${MONTH_NAMES[currentMonth.getMonth()]}! 🍽️\n\n${url}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    setShowShareMenu(false);
  };

  // Função para compartilhar por Email
  const shareEmail = () => {
    const url = `${window.location.origin}/#/menu-calendar?enterprise=${enterpriseId}`;
    const subject = encodeURIComponent(`Cardápio de ${MONTH_NAMES[currentMonth.getMonth()]} - ${enterpriseName}`);
    const body = encodeURIComponent(
      `Olá!\n\nConfira nosso cardápio para o mês de ${MONTH_NAMES[currentMonth.getMonth()]}:\n\n${url}\n\nBom apetite! 🍽️`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShowShareMenu(false);
  };

  // Função para exportar PDF
  const downloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Header
      pdf.setFillColor(76, 175, 80); // Verde
      pdf.rect(0, 0, pageWidth, 35, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(24);
      pdf.setFont(undefined, 'bold');
      pdf.text(enterpriseName, pageWidth / 2, 15, { align: 'center' });
      
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text(
        `Cardápio de ${MONTH_NAMES[currentMonth.getMonth()]} de ${currentMonth.getFullYear()}`,
        pageWidth / 2,
        28,
        { align: 'center' }
      );

      yPos = 50;

      // Dias do mês
      const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const dayOfWeekNum = date.getDay();
        let dayOfWeekName = '';
        
        if (dayOfWeekNum === 1) dayOfWeekName = 'Segunda-feira';
        else if (dayOfWeekNum === 2) dayOfWeekName = 'Terça-feira';
        else if (dayOfWeekNum === 3) dayOfWeekName = 'Quarta-feira';
        else if (dayOfWeekNum === 4) dayOfWeekName = 'Quinta-feira';
        else if (dayOfWeekNum === 5) dayOfWeekName = 'Sexta-feira';
        else if (dayOfWeekNum === 6) dayOfWeekName = 'Sábado';
        else dayOfWeekName = 'Domingo';

        // Verificar se precisa de nova página
        if (yPos > pageHeight - 30) {
          pdf.addPage();
          yPos = margin;
        }

        // Dia
        pdf.setTextColor(76, 175, 80);
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${day} • ${dayOfWeekName}`, margin, yPos);
        yPos += 8;

        // Items do menu
        const calendarDay = calendarDays.find(cd => cd.date === day && !cd.isOtherMonth);
        if (calendarDay?.items && calendarDay.items.length > 0) {
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          
          calendarDay.items.forEach((item: MenuItem) => {
            const lines = pdf.splitTextToSize(`• ${item.name}`, pageWidth - margin * 2 - 5);
            lines.forEach((line: string, idx: number) => {
              pdf.text(line, margin + 5, yPos);
              yPos += 5;
            });
          });
        } else {
          pdf.setTextColor(150, 150, 150);
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'italic');
          pdf.text('Sem refeições programadas', margin + 5, yPos);
          yPos += 5;
        }

        yPos += 6;
      }

      // Footer
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(8);
      pdf.text(
        `Emitido em ${new Date().toLocaleDateString('pt-BR')} • ${enterpriseName}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );

      pdf.save(`Cardapio-${MONTH_NAMES[currentMonth.getMonth()]}-${currentMonth.getFullYear()}.pdf`);
      notificationService.informativo('Sucesso', 'PDF baixado com sucesso!');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      notificationService.alerta('Erro', 'Não foi possível gerar o PDF');
    }
  };

  const monthYear = `${MONTH_NAMES[currentMonth.getMonth()]} de ${currentMonth.getFullYear()}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-emerald-950 dark:via-slate-900 dark:to-blue-950 p-4 sm:p-8">
      {/* Container Principal */}
      <div className="max-w-6xl mx-auto">
        {/* Header Profissional */}
        <div className="mb-8 space-y-6">
          {/* Branding */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <Utensils className="text-emerald-600 dark:text-emerald-400" size={32} />
              <h1 className="text-4xl sm:text-5xl font-black text-gray-800 dark:text-white tracking-tight">
                Cardápio
              </h1>
              <Heart className="text-red-500 dark:text-red-400" size={32} />
            </div>
            <p className="text-lg text-emerald-700 dark:text-emerald-300 font-semibold">
              {enterpriseName}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Descubra nossas refeições deliciosas e saudáveis para {monthYear}
            </p>
          </div>

          {/* Controles */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700">
            {/* Navegação de Mês */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
              
              <div className="min-w-[180px] text-center">
                <p className="text-lg font-bold text-gray-800 dark:text-white">{monthYear}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Clique nas setas para navegar
                </p>
              </div>
              
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ChevronRight size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {/* Copiar Link */}
              <button
                onClick={copyLinkToClipboard}
                className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center gap-2 text-sm font-semibold shadow-sm"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar Link'}
              </button>

              {/* Download PDF */}
              <button
                onClick={downloadPDF}
                disabled={isLoading}
                className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors flex items-center gap-2 text-sm font-semibold shadow-sm disabled:opacity-50"
              >
                <Download size={16} />
                PDF
              </button>

              {/* Compartilhar */}
              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="px-4 py-2 bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-800 transition-colors flex items-center gap-2 text-sm font-semibold shadow-sm"
                >
                  <Share2 size={16} />
                  Compartilhar
                </button>

                {/* Menu de Compartilhamento */}
                {showShareMenu && (
                  <div className="absolute right-0 mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-100 dark:border-slate-700 z-50">
                    <button
                      onClick={shareWhatsApp}
                      className="block w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm font-medium first:rounded-t-lg"
                    >
                      <Smartphone size={16} className="text-green-600" />
                      WhatsApp
                    </button>
                    <button
                      onClick={shareEmail}
                      className="block w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm font-medium last:rounded-b-lg"
                    >
                      <Mail size={16} className="text-blue-600" />
                      Email
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Calendário */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center space-y-4">
              <div className="animate-spin inline-block">
                <Loader2 size={40} className="text-emerald-600" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 font-semibold">Carregando cardápio...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Calendário em Grid */}
            <div className="md:col-span-2">
              {/* Cards de Dias */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleCalendarDays.map((day, idx) => (
                  <div
                    key={idx}
                    className={`
                      rounded-lg p-3 flex flex-col
                      ${day.isOtherMonth
                        ? 'bg-gray-50 dark:bg-slate-800 text-gray-400'
                        : 'bg-white dark:bg-slate-700 border-2 border-emerald-100 dark:border-emerald-800 shadow-md hover:shadow-lg transition-shadow'
                      }
                    `}
                  >
                    {day.date && (
                      <>
                        <div className="mb-2">
                          <p className={`text-sm font-bold ${!day.isOtherMonth ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                            {day.date}
                          </p>
                          {!day.isOtherMonth && day.dayOfWeek && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{DAY_LABELS[day.dayOfWeek]}</p>
                          )}
                        </div>

                        {!day.isOtherMonth && day.items && day.items.length > 0 ? (
                          <ul className="space-y-2">
                            {day.items.map((item: MenuItem, itemIdx: number) => (
                              <li
                                key={itemIdx}
                                className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900 dark:to-blue-900 p-2 rounded border-l-2 border-emerald-500 dark:border-emerald-400"
                              >
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap break-words">
                                    {item.description}
                                  </p>
                                )}
                                {!item.description && Array.isArray(item.ingredients) && item.ingredients.length > 0 && (
                                  <ul className="mt-1 space-y-0.5 list-disc pl-4">
                                    {item.ingredients
                                      .map((ing) => String(ing?.name || '').trim())
                                      .filter(Boolean)
                                      .map((ingredientName, ingredientIndex) => (
                                        <li key={`${itemIdx}-${ingredientName}-${ingredientIndex}`} className="text-[10px] text-gray-600 dark:text-gray-400 break-words">
                                          {ingredientName}
                                        </li>
                                      ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : !day.isOtherMonth ? (
                          <div className="flex-1 flex items-center justify-center">
                            <p className="text-xs text-gray-400 dark:text-gray-500 text-center italic">
                              Sem refeições
                            </p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
              {visibleCalendarDays.length === 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-4">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Nenhum cardápio disponível neste mês.</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Os dias sem cardápio e os dias bloqueados por feriado/recesso no calendário escolar não são exibidos.
                  </p>
                </div>
              )}
            </div>

            {/* Painel Lateral - Dicas de Saúde */}
            <div className="md:col-span-2 space-y-4">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900 dark:to-cyan-900 rounded-xl p-6 border border-blue-200 dark:border-blue-700">
                <div className="flex items-start gap-3">
                  <Leaf className="text-green-600 dark:text-green-400 flex-shrink-0 mt-1" size={24} />
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white mb-2">Refeições Saudáveis</h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Nosso cardápio é cuidadosamente planejado por nutricionistas para oferecer refeições balanceadas,
                      saudáveis e deliciosas. Priorizamos alimentos naturais e nutritivos! 🥗
                    </p>
                  </div>
                </div>
              </div>

              {/* Informações de Contato */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
                <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <AlertCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
                  Dúvidas?
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                  Entre em contato conosco para informações sobre alergias, substituições ou dúvidas sobre o cardápio.
                </p>
                {activeEnterprise?.phone1 && (
                  <a
                    href={`https://wa.me/${activeEnterprise.phone1}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold text-sm transition-colors"
                  >
                    <Smartphone size={16} />
                    Contate-nos no WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuCalendarPage;
