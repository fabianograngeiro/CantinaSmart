import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, Clock3, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import ApiService from '../services/api';
import { Enterprise, Role, User } from '../types';
import { appendSaasAuditLog } from '../services/saasAuditLog';

interface SaasWhatsAppPageProps {
  currentUser: User;
}

type QueueStatus = 'PENDENTE' | 'EM_ATENDIMENTO' | 'FINALIZADO';
type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
type SaasInvoice = {
  id: string;
  enterpriseId: string;
  enterpriseName: string;
  ownerName: string;
  referenceMonth: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};

type SupportTicket = {
  id: string;
  enterpriseId: string;
  enterpriseName: string;
  ownerName: string;
  phone: string;
  subject: string;
  status: QueueStatus;
  createdAt: string;
  sourceType?: 'MANUAL' | 'BILLING_OVERDUE';
  sourceRef?: string;
  lastWhatsAppAt?: string;
  lastWhatsAppBy?: string;
  whatsappContactCount?: number;
};

type CampaignLog = {
  id: string;
  title: string;
  message: string;
  targetCount: number;
  sentBy: string;
  sentAt: string;
};

const TICKETS_STORAGE_KEY = 'saas_whatsapp_tickets_v1';
const CAMPAIGNS_STORAGE_KEY = 'saas_whatsapp_campaigns_v1';
const INVOICES_STORAGE_KEY = 'saas_invoices_v1';
const CONTACT_AGE_FILTER_STORAGE_KEY = 'saas_whatsapp_contact_age_filter_v1';

const DEFAULT_TEMPLATES = {
  COBRANCA: 'Olá, {OWNER}. Identificamos uma pendência da rede {REDE}. Favor regularizar para manter os serviços ativos.',
  RENOVACAO: 'Olá, {OWNER}. Sua renovação mensal da rede {REDE} está próxima. Precisa de apoio para garantir continuidade?',
  BOAS_VINDAS: 'Olá, {OWNER}. Bem-vindo(a) ao Cantina Smart SaaS. Time de Sucesso disponível para te apoiar.'
};

const formatDateTime = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}`;
};

const formatShortDate = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const getDaysSince = (iso?: string): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const normalizeWhatsappPhone = (raw?: string): string => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 11) return `55${digits}`;
  return digits;
};

const readInvoicesFromStorage = (): SaasInvoice[] => {
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readContactAgeFilterFromStorage = (): 'ALL' | 'NEVER' | '3' | '7' | '15' | '30' => {
  try {
    const raw = localStorage.getItem(CONTACT_AGE_FILTER_STORAGE_KEY);
    if (raw === 'ALL' || raw === 'NEVER' || raw === '3' || raw === '7' || raw === '15' || raw === '30') return raw;
  } catch {
    // no-op
  }
  return 'ALL';
};

const SaasWhatsAppPage: React.FC<SaasWhatsAppPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser.role || '').toUpperCase() === Role.SUPERADMIN;
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignLog[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QueueStatus>('ALL');
  const [contactAgeFilter, setContactAgeFilter] = useState<'ALL' | 'NEVER' | '3' | '7' | '15' | '30'>(readContactAgeFilterFromStorage);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignMessage, setCampaignMessage] = useState(DEFAULT_TEMPLATES.COBRANCA);
  const [selectedTargets, setSelectedTargets] = useState<Record<string, boolean>>({});
  const [autoSyncCount, setAutoSyncCount] = useState(0);
  const [ticketsHydrated, setTicketsHydrated] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await ApiService.getEnterprises();
        const list = Array.isArray(data) ? data : [];
        setEnterprises(list);
        setSelectedTargets(
          list.reduce((acc: Record<string, boolean>, ent) => {
            acc[ent.id] = true;
            return acc;
          }, {})
        );
      } catch (err) {
        console.error('Erro ao carregar clientes SaaS:', err);
        setEnterprises([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TICKETS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setTickets(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTickets([]);
    } finally {
      setTicketsHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setCampaigns(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CONTACT_AGE_FILTER_STORAGE_KEY, contactAgeFilter);
  }, [contactAgeFilter]);

  const saveTickets = (next: SupportTicket[]) => {
    setTickets(next);
    localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(next));
  };

  const saveCampaigns = (next: CampaignLog[]) => {
    setCampaigns(next);
    localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(next));
  };

  const addTicket = (enterprise: Enterprise) => {
    const ticket: SupportTicket = {
      id: `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name,
      ownerName: enterprise.ownerName || enterprise.managerName || 'Owner',
      phone: enterprise.phone1 || enterprise.phone2 || '',
      subject: 'Atendimento inbound WhatsApp',
      status: 'PENDENTE',
      createdAt: new Date().toISOString(),
      sourceType: 'MANUAL'
    };
    saveTickets([ticket, ...tickets]);
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'WHATSAPP',
      action: 'SAAS_WHATSAPP_TICKET_CREATED_MANUAL',
      entityType: 'TICKET',
      entityId: ticket.id,
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name,
      summary: 'Ticket manual criado na fila WhatsApp SaaS',
      metadata: { subject: ticket.subject }
    });
  };

  const syncOverdueBillingTickets = (showAlert = false) => {
    let invoices: SaasInvoice[] = [];
    invoices = readInvoicesFromStorage();

    const overdueInvoices = invoices.filter((inv) => inv.status === 'OVERDUE');
    const overdueRefSet = new Set(overdueInvoices.map((inv) => `OVERDUE::${inv.enterpriseId}::${inv.referenceMonth}`));
    let created = 0;
    let reopened = 0;
    let autoClosed = 0;

    const byEnterpriseId = enterprises.reduce((acc: Record<string, Enterprise>, ent) => {
      acc[ent.id] = ent;
      return acc;
    }, {});

    let nextTickets = [...tickets];

    overdueInvoices.forEach((inv) => {
      const sourceRef = `OVERDUE::${inv.enterpriseId}::${inv.referenceMonth}`;
      const existingIndex = nextTickets.findIndex((t) => t.sourceRef === sourceRef);
      if (existingIndex === -1) {
        const ent = byEnterpriseId[inv.enterpriseId];
        nextTickets.unshift({
          id: `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          enterpriseId: inv.enterpriseId,
          enterpriseName: inv.enterpriseName,
          ownerName: inv.ownerName,
          phone: ent?.phone1 || ent?.phone2 || '',
          subject: `Cobrança automática: fatura ${inv.referenceMonth} em atraso (${inv.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
          status: 'PENDENTE',
          createdAt: new Date().toISOString(),
          sourceType: 'BILLING_OVERDUE',
          sourceRef
        });
        created += 1;
      } else if (nextTickets[existingIndex].status === 'FINALIZADO') {
        nextTickets[existingIndex] = {
          ...nextTickets[existingIndex],
          status: 'PENDENTE'
        };
        reopened += 1;
      }
    });

    nextTickets = nextTickets.map((ticket) => {
      if (ticket.sourceType !== 'BILLING_OVERDUE' || !ticket.sourceRef) return ticket;
      if (!overdueRefSet.has(ticket.sourceRef) && ticket.status !== 'FINALIZADO') {
        autoClosed += 1;
        return { ...ticket, status: 'FINALIZADO' };
      }
      return ticket;
    });

    const changed = created > 0 || reopened > 0 || autoClosed > 0;
    if (changed) {
      saveTickets(nextTickets);
      setAutoSyncCount((prev) => prev + created + reopened + autoClosed);
      appendSaasAuditLog({
        actorName: currentUser.name,
        actorRole: String(currentUser.role || ''),
        module: 'WHATSAPP',
        action: 'SAAS_WHATSAPP_OVERDUE_SYNC',
        entityType: 'TICKET',
        summary: 'Sincronização de inadimplentes na fila WhatsApp executada',
        metadata: { created, reopened, autoClosed }
      });
    }
    if (showAlert) {
      alert(`Sincronização concluída.\nCriados: ${created}\nReabertos: ${reopened}\nFinalizados automáticos: ${autoClosed}`);
    }
  };

  useEffect(() => {
    if (!enterprises.length || !ticketsHydrated) return;
    syncOverdueBillingTickets(false);
  }, [enterprises.length, ticketsHydrated]);

  const updateTicketStatus = (id: string, nextStatus: QueueStatus) => {
    const target = tickets.find((t) => t.id === id);
    if (!target) return;
    const next = tickets.map((t) => (t.id === id ? { ...t, status: nextStatus } : t));
    saveTickets(next);
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'WHATSAPP',
      action: 'SAAS_WHATSAPP_TICKET_STATUS_CHANGED',
      entityType: 'TICKET',
      entityId: target.id,
      enterpriseId: target.enterpriseId,
      enterpriseName: target.enterpriseName,
      summary: `Status do ticket alterado para ${nextStatus}`,
      metadata: { fromStatus: target.status, toStatus: nextStatus }
    });
  };

  const openTicketOnWhatsApp = (ticket: SupportTicket) => {
    const latestInvoices = readInvoicesFromStorage();
    const fallbackPhone = enterprises.find((ent) => ent.id === ticket.enterpriseId)?.phone1
      || enterprises.find((ent) => ent.id === ticket.enterpriseId)?.phone2
      || ticket.phone;
    const phone = normalizeWhatsappPhone(fallbackPhone);
    if (!phone) {
      alert('Cliente sem WhatsApp cadastrado.');
      return;
    }

    let message = `Olá ${ticket.ownerName}, tudo bem? Aqui é do suporte Cantina Smart.\n` +
      `Estamos entrando em contato sobre a rede ${ticket.enterpriseName}.\n` +
      `Assunto: ${ticket.subject}`;

    if (ticket.sourceType === 'BILLING_OVERDUE' && ticket.sourceRef) {
      const [, enterpriseId, referenceMonth] = ticket.sourceRef.split('::');
      const relatedInvoice = latestInvoices.find((inv) => inv.enterpriseId === enterpriseId && inv.referenceMonth === referenceMonth);
      if (relatedInvoice) {
        message = [
          `Olá ${ticket.ownerName}, tudo bem?`,
          `Identificamos a fatura da rede ${ticket.enterpriseName} em atraso.`,
          `Referência: ${relatedInvoice.referenceMonth}`,
          `Vencimento: ${formatShortDate(relatedInvoice.dueDate)}`,
          `Valor: ${formatCurrency(relatedInvoice.amount)}`,
          '',
          'Podemos te ajudar na regularização?'
        ].join('\n');
      }
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    const nowIso = new Date().toISOString();
    const next = tickets.map((item) =>
      item.id === ticket.id
        ? {
            ...item,
            lastWhatsAppAt: nowIso,
            lastWhatsAppBy: currentUser.name,
            whatsappContactCount: Number(item.whatsappContactCount || 0) + 1
          }
        : item
    );
    saveTickets(next);
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'WHATSAPP',
      action: 'SAAS_WHATSAPP_TICKET_CONTACT_SENT',
      entityType: 'TICKET',
      entityId: ticket.id,
      enterpriseId: ticket.enterpriseId,
      enterpriseName: ticket.enterpriseName,
      summary: 'Contato enviado via WhatsApp a partir do ticket',
      metadata: { sourceType: ticket.sourceType || 'MANUAL', phone }
    });
  };

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const daysSince = getDaysSince(t.lastWhatsAppAt);
      const matchesContactAge =
        contactAgeFilter === 'ALL'
          ? true
          : contactAgeFilter === 'NEVER'
            ? !t.lastWhatsAppAt
            : Boolean(t.lastWhatsAppAt) && daysSince >= Number(contactAgeFilter);
      const matchesSearch =
        !term ||
        t.enterpriseName.toLowerCase().includes(term) ||
        t.ownerName.toLowerCase().includes(term) ||
        t.phone.toLowerCase().includes(term);
      return matchesStatus && matchesContactAge && matchesSearch;
    });
  }, [tickets, search, statusFilter, contactAgeFilter]);

  const queueStats = useMemo(() => {
    const pendentes = tickets.filter((t) => t.status === 'PENDENTE').length;
    const atendimento = tickets.filter((t) => t.status === 'EM_ATENDIMENTO').length;
    const finalizados = tickets.filter((t) => t.status === 'FINALIZADO').length;
    return { pendentes, atendimento, finalizados };
  }, [tickets]);

  const selectedEnterpriseIds = useMemo(
    () => Object.entries(selectedTargets).filter(([, checked]) => checked).map(([id]) => id),
    [selectedTargets]
  );

  const handleUseTemplate = (template: keyof typeof DEFAULT_TEMPLATES) => {
    setCampaignMessage(DEFAULT_TEMPLATES[template]);
  };

  const handleSendCampaign = async () => {
    const targets = enterprises.filter((ent) => selectedEnterpriseIds.includes(ent.id));
    if (!campaignTitle.trim()) {
      alert('Informe o título da campanha.');
      return;
    }
    if (!campaignMessage.trim()) {
      alert('Informe a mensagem da campanha.');
      return;
    }
    if (targets.length === 0) {
      alert('Selecione ao menos um cliente.');
      return;
    }

    const preview = targets
      .slice(0, 1)
      .map((ent) =>
        campaignMessage
          .replaceAll('{OWNER}', ent.ownerName || ent.managerName || 'Owner')
          .replaceAll('{REDE}', ent.name)
      )[0];

    try {
      await navigator.clipboard.writeText(preview || campaignMessage);
    } catch {
      // no-op
    }

    const log: CampaignLog = {
      id: `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: campaignTitle.trim(),
      message: campaignMessage.trim(),
      targetCount: targets.length,
      sentBy: currentUser.name,
      sentAt: new Date().toISOString()
    };
    saveCampaigns([log, ...campaigns].slice(0, 200));
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'WHATSAPP',
      action: 'SAAS_WHATSAPP_CAMPAIGN_CREATED',
      entityType: 'CAMPAIGN',
      entityId: log.id,
      summary: `Campanha registrada: ${log.title}`,
      metadata: { targetCount: log.targetCount }
    });
    alert(`Campanha registrada para ${targets.length} cliente(s). Prévia copiada para WhatsApp.`);
  };

  if (!isSuperAdmin) {
    return <div className="p-6 text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN.</div>;
  }

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <MessageCircle size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Central WhatsApp SaaS</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Fila de atendimento e disparo em massa do SUPERADMIN
            </p>
          </div>
        </div>
        <button
          onClick={() => syncOverdueBillingTickets(true)}
          className="px-3 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
        >
          Sincronizar Inadimplentes
        </button>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard title="Pendentes" value={String(queueStats.pendentes)} icon={<Clock3 size={14} className="text-amber-600" />} />
        <MetricCard title="Em Atendimento" value={String(queueStats.atendimento)} icon={<AlertTriangle size={14} className="text-indigo-600" />} />
        <MetricCard title="Finalizados" value={String(queueStats.finalizados)} icon={<CheckCircle2 size={14} className="text-emerald-600" />} />
      </section>
      {autoSyncCount > 0 && (
        <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Fila sincronizada com cobrança automática: {autoSyncCount} atualização(ões).</p>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Fila de Atendimento</h3>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | QueueStatus)}
                className="h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
              >
                <option value="ALL">Todos</option>
                <option value="PENDENTE">Pendente</option>
                <option value="EM_ATENDIMENTO">Em atendimento</option>
                <option value="FINALIZADO">Finalizado</option>
              </select>
              <select
                value={contactAgeFilter}
                onChange={(e) => setContactAgeFilter(e.target.value as 'ALL' | 'NEVER' | '3' | '7' | '15' | '30')}
                className="h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
                title="Filtrar por tempo sem contato no WhatsApp"
              >
                <option value="ALL">Contato: todos</option>
                <option value="NEVER">Contato: nunca enviado</option>
                <option value="3">Sem contato: 3+ dias</option>
                <option value="7">Sem contato: 7+ dias</option>
                <option value="15">Sem contato: 15+ dias</option>
                <option value="30">Sem contato: 30+ dias</option>
              </select>
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Contato</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Criado</th>
                  <th className="px-3 py-2 text-center">Último WhatsApp</th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-slate-100 dark:border-zinc-800">
                    <td className="px-3 py-2.5">
                      <p className="font-black text-slate-800 dark:text-zinc-100">{ticket.enterpriseName}</p>
                      <p className="font-bold text-slate-500 dark:text-zinc-400">{ticket.subject}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-700 dark:text-zinc-200">{ticket.ownerName}</p>
                      <p className="font-bold text-slate-500 dark:text-zinc-400">{ticket.phone || 'Sem número'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-slate-500 dark:text-zinc-400">{formatDateTime(ticket.createdAt)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {ticket.lastWhatsAppAt ? (
                        <div className="leading-tight">
                          <p className="font-black text-slate-700 dark:text-zinc-200">{formatDateTime(ticket.lastWhatsAppAt)}</p>
                          <p className="font-bold text-[10px] text-slate-500 dark:text-zinc-400">
                            {ticket.lastWhatsAppBy || 'Sistema'} • {ticket.whatsappContactCount || 1}x
                          </p>
                        </div>
                      ) : (
                        <span className="font-bold text-[10px] text-slate-400 dark:text-zinc-500">Nunca enviado</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openTicketOnWhatsApp(ticket)}
                          className="px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100"
                        >
                          WhatsApp
                        </button>
                        {ticket.status === 'PENDENTE' && (
                          <button onClick={() => updateTicketStatus(ticket.id, 'EM_ATENDIMENTO')} className="px-2 py-1 rounded-md bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700">
                            Atender
                          </button>
                        )}
                        {ticket.status !== 'FINALIZADO' && (
                          <button onClick={() => updateTicketStatus(ticket.id, 'FINALIZADO')} className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700">
                            Finalizar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTickets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                      Nenhum chamado na fila para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 space-y-3">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Entrada Rápida</h3>
          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Gerar ticket manual para testar fila</p>
          <div className="max-h-56 overflow-auto space-y-1.5">
            {enterprises.map((ent) => (
              <button
                key={ent.id}
                onClick={() => addTicket(ent)}
                className="w-full text-left px-2.5 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-zinc-700"
              >
                <p className="text-[11px] font-black text-slate-800 dark:text-zinc-100">{ent.name}</p>
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">{ent.ownerName || ent.managerName || 'Owner'}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Disparo em Massa (Admin)</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => handleUseTemplate('COBRANCA')} className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 text-[10px] font-black uppercase text-slate-700 dark:text-zinc-200">Cobrança</button>
            <button onClick={() => handleUseTemplate('RENOVACAO')} className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 text-[10px] font-black uppercase text-slate-700 dark:text-zinc-200">Renovação</button>
            <button onClick={() => handleUseTemplate('BOAS_VINDAS')} className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 text-[10px] font-black uppercase text-slate-700 dark:text-zinc-200">Boas-vindas</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2 space-y-2">
            <input
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              placeholder="Título da campanha"
              className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
            />
            <textarea
              value={campaignMessage}
              onChange={(e) => setCampaignMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
            />
            <div className="flex items-center gap-2">
              <button onClick={handleSendCampaign} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-700 flex items-center gap-1.5">
                <Send size={12} />
                Registrar Disparo
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(campaignMessage);
                    alert('Mensagem copiada.');
                  } catch {
                    alert('Não foi possível copiar.');
                  }
                }}
                className="px-3 py-2 rounded-md border border-slate-200 dark:border-zinc-700 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200 flex items-center gap-1.5"
              >
                <Copy size={12} />
                Copiar Texto
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-auto border border-slate-200 dark:border-zinc-700 rounded-md p-2">
            {enterprises.map((ent) => (
              <label key={ent.id} className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={Boolean(selectedTargets[ent.id])}
                  onChange={(e) => setSelectedTargets((prev) => ({ ...prev, [ent.id]: e.target.checked }))}
                />
                <span>{ent.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-zinc-800 pt-2">
          <h4 className="text-[11px] font-black text-slate-700 dark:text-zinc-200 uppercase tracking-wider mb-2">Histórico de Disparos</h4>
          <div className="max-h-40 overflow-auto space-y-1.5">
            {campaigns.length === 0 && <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Sem campanhas registradas.</p>}
            {campaigns.map((log) => (
              <div key={log.id} className="px-2.5 py-2 rounded-md bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                <p className="text-[11px] font-black text-slate-800 dark:text-zinc-100">{log.title}</p>
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                  {log.targetCount} clientes • {formatDateTime(log.sentAt)} • {log.sentBy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const MetricCard = ({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) => (
  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
    <div className="flex items-center justify-between mb-1">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-400">{title}</p>
      <div>{icon}</div>
    </div>
    <p className="text-lg font-black text-slate-900 dark:text-zinc-100 leading-tight">{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: QueueStatus }) => {
  if (status === 'FINALIZADO') {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-emerald-200 bg-emerald-50 text-emerald-700">Finalizado</span>;
  }
  if (status === 'EM_ATENDIMENTO') {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-indigo-200 bg-indigo-50 text-indigo-700">Atendimento</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-amber-200 bg-amber-50 text-amber-700">Pendente</span>;
};

export default SaasWhatsAppPage;
