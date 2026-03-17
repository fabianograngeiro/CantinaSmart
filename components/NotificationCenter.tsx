import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, ShieldAlert, X } from 'lucide-react';
import notificationService, { NotificationLevel } from '../services/notificationService';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  level: NotificationLevel;
  durationMs: number;
}

const levelStyles: Record<NotificationLevel, { box: string; iconBox: string; icon: React.ReactNode }> = {
  informativo: {
    box: 'border-sky-200 bg-sky-50 text-sky-900',
    iconBox: 'bg-sky-100 text-sky-700',
    icon: <Bell size={16} />,
  },
  alerta: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    iconBox: 'bg-amber-100 text-amber-700',
    icon: <AlertTriangle size={16} />,
  },
  urgente: {
    box: 'border-orange-200 bg-orange-50 text-orange-900',
    iconBox: 'bg-orange-100 text-orange-700',
    icon: <AlertTriangle size={16} />,
  },
  critico: {
    box: 'border-red-200 bg-red-50 text-red-900',
    iconBox: 'bg-red-100 text-red-700',
    icon: <ShieldAlert size={16} />,
  },
};

const NotificationCenter: React.FC = () => {
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const timeoutRefs = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((payload) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const item: NotificationItem = {
        id,
        title: payload.title,
        message: payload.message,
        level: payload.level,
        durationMs: payload.durationMs,
      };

      setQueue((prev) => [...prev, item]);
      const timeoutId = window.setTimeout(() => {
        setQueue((prev) => prev.filter((current) => current.id !== id));
        timeoutRefs.current.delete(id);
      }, item.durationMs);
      timeoutRefs.current.set(id, timeoutId);
    });

    return () => {
      unsubscribe();
      timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutRefs.current.clear();
    };
  }, []);

  const visibleQueue = useMemo(() => queue.slice(0, 5), [queue]);

  const dismiss = (id: string) => {
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  if (visibleQueue.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[2000] pointer-events-none">
      <div className="flex flex-col gap-2.5 w-[360px] max-w-[92vw]">
        {visibleQueue.map((item) => {
          const style = levelStyles[item.level];
          return (
            <div
              key={item.id}
              className={`pointer-events-auto border shadow-lg rounded-2xl p-3.5 backdrop-blur-sm animate-in slide-in-from-right-6 duration-200 ${style.box}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${style.iconBox}`}>
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest">{item.title}</p>
                  <p className="text-xs font-semibold mt-1 leading-relaxed break-words">{item.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="w-6 h-6 rounded-lg border border-black/10 bg-white/70 hover:bg-white transition-colors flex items-center justify-center shrink-0"
                  aria-label="Fechar notificação"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationCenter;
