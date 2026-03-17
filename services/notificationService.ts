export type NotificationLevel = 'informativo' | 'alerta' | 'urgente' | 'critico';

export interface NotificationPayload {
  title: string;
  message: string;
  level?: NotificationLevel;
  durationMs?: number;
}

type NotificationListener = (payload: Required<NotificationPayload>) => void;

const DEFAULT_DURATION_MS = 4000;
const listeners = new Set<NotificationListener>();

const emit = (payload: NotificationPayload) => {
  const normalizedPayload: Required<NotificationPayload> = {
    title: String(payload.title || '').trim() || 'Notificação',
    message: String(payload.message || '').trim() || 'Ação executada.',
    level: payload.level || 'informativo',
    durationMs: Number.isFinite(payload.durationMs) && Number(payload.durationMs) > 0
      ? Number(payload.durationMs)
      : DEFAULT_DURATION_MS,
  };

  listeners.forEach((listener) => listener(normalizedPayload));
};

export const notificationService = {
  subscribe(listener: NotificationListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  notify(payload: NotificationPayload) {
    emit(payload);
  },
  informativo(title: string, message: string, durationMs = DEFAULT_DURATION_MS) {
    emit({ title, message, level: 'informativo', durationMs });
  },
  alerta(title: string, message: string, durationMs = DEFAULT_DURATION_MS) {
    emit({ title, message, level: 'alerta', durationMs });
  },
  urgente(title: string, message: string, durationMs = DEFAULT_DURATION_MS) {
    emit({ title, message, level: 'urgente', durationMs });
  },
  critico(title: string, message: string, durationMs = DEFAULT_DURATION_MS) {
    emit({ title, message, level: 'critico', durationMs });
  },
};

export default notificationService;
