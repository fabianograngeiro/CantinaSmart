import { useEffect, useMemo, useState } from 'react';
import ApiService from '../../services/api';
import { Client, Enterprise } from '../../types';
import { DisparoLogItem, ResponsibleTarget } from './types';

const LOG_STORAGE_KEY = 'whatsapp_disparo_unico_logs_v1';

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const toWhatsAppChatId = (phone: string) => `${normalizePhone(phone)}@c.us`;

const readAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',').pop() || '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo anexado.'));
    reader.readAsDataURL(file);
  });

const waitMs = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), Math.max(0, ms));
  });

const randomInt = (min: number, max: number) => {
  const safeMin = Math.max(0, Number(min) || 0);
  const safeMax = Math.max(safeMin, Number(max) || 0);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
};

const fillTemplate = (template: string, responsible: ResponsibleTarget | null) => {
  const fallbackName = 'Responsável';
  const fullName = responsible?.name || fallbackName;
  const firstName = fullName.trim().split(/\s+/).filter(Boolean)[0] || fallbackName;
  const alunos = responsible?.students.map((item) => item.name).filter(Boolean).join(', ') || 'Aluno';
  const date = new Date().toLocaleDateString('pt-BR');

  return String(template || '')
    .replace(/\{\{\s*nome\s*\}\}/gi, fullName)
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, firstName)
    .replace(/\{\{\s*alunos\s*\}\}/gi, alunos)
    .replace(/\{\{\s*data\s*\}\}/gi, date);
};

const pickResponsibleName = (client: Client) =>
  String(
    client.parentName
    || client.guardianName
    || (Array.isArray(client.guardians) ? client.guardians[0] : '')
    || client.name
    || ''
  ).trim();

const pickResponsiblePhone = (client: Client) =>
  normalizePhone(
    String(client.parentWhatsapp || client.guardianPhone || client.phone || '').trim()
  );

const buildResponsibleTargets = (clients: Client[]): ResponsibleTarget[] => {
  const grouped = new Map<string, ResponsibleTarget>();

  clients.forEach((client) => {
    const responsibleName = pickResponsibleName(client);
    const responsiblePhone = pickResponsiblePhone(client);
    if (!responsibleName || !responsiblePhone) return;

    const key = `${responsibleName.toLowerCase()}__${responsiblePhone}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        id: key,
        name: responsibleName,
        phone: responsiblePhone,
        students: [{ id: client.id, name: client.name }],
      });
      return;
    }
    if (!existing.students.some((student) => student.id === client.id)) {
      existing.students.push({ id: client.id, name: client.name });
    }
  });

  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

type SendPayload = {
  responsible: ResponsibleTarget;
  template: string;
  file?: File | null;
  scheduledAt?: string;
  delayMin: number;
  delayMax: number;
};

export const useDisparoUnico = (activeEnterprise: Enterprise | null) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [logs, setLogs] = useState<DisparoLogItem[]>(() => {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!activeEnterprise?.id) return;
    let cancelled = false;
    const run = async () => {
      try {
        setIsLoadingClients(true);
        const list = await ApiService.getClients(activeEnterprise.id);
        if (!cancelled) setClients(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setIsLoadingClients(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeEnterprise?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, 200)));
    } catch {
      // ignore
    }
  }, [logs]);

  const responsibleTargets = useMemo(() => buildResponsibleTargets(clients), [clients]);

  const sendMessage = async (payload: SendPayload) => {
    const { responsible, template, file, scheduledAt, delayMin, delayMax } = payload;
    const message = fillTemplate(template, responsible).trim();
    if (!message) {
      throw new Error('Digite uma mensagem antes de enviar.');
    }
    if (!responsible.phone) {
      throw new Error('O responsável selecionado não possui telefone válido.');
    }

    setIsSending(true);
    const now = Date.now();
    const delaySeconds = randomInt(delayMin, delayMax);
    const waitUntilScheduled = scheduledAt ? (new Date(scheduledAt).getTime() - now) : 0;
    const totalWaitMs = Math.max(0, waitUntilScheduled) + delaySeconds * 1000;

    try {
      await waitMs(totalWaitMs);

      if (file) {
        const base64Data = await readAsBase64(file);
        const mimeType = String(file.type || '').toLowerCase();
        const mediaType: 'image' | 'audio' | 'document' =
          mimeType.startsWith('image/')
            ? 'image'
            : mimeType.startsWith('audio/')
              ? 'audio'
              : 'document';

        await ApiService.sendWhatsAppMediaToChat(
          toWhatsAppChatId(responsible.phone),
          message,
          {
            mediaType,
            base64Data,
            mimeType: file.type || undefined,
            fileName: file.name || undefined,
          }
        );
      } else {
        await ApiService.sendWhatsAppMessage(responsible.phone, message);
      }

      const status = scheduledAt && new Date(scheduledAt).getTime() > now ? 'AGENDADO' : 'ENVIADO';
      setLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome: responsible.name,
          telefone: responsible.phone,
          status,
          timestamp: Date.now(),
          detalhe: file ? `Anexo: ${file.name}` : undefined,
        },
        ...prev,
      ]);
    } catch (error) {
      setLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome: responsible.name,
          telefone: responsible.phone,
          status: 'ERRO',
          timestamp: Date.now(),
          detalhe: error instanceof Error ? error.message : 'Falha no envio',
        },
        ...prev,
      ]);
      throw error;
    } finally {
      setIsSending(false);
    }
  };

  return {
    responsibleTargets,
    isLoadingClients,
    isSending,
    logs,
    sendMessage,
  };
};

