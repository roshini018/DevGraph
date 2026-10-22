import React, { useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastContext, type ToastType, type ToastMessage } from './ToastContext';

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(
    (msg: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { ...msg, id };
      setToasts(prev => [...prev, newToast]);

      const duration = msg.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-green-bright shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-ember shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-danger shrink-0" />,
    info: <Info className="w-4 h-4 text-slate shrink-0" />,
  };

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 p-3 bg-raised border border-line-strong rounded shadow-xl font-sans text-xs animate-in slide-in-from-bottom-2 duration-150"
          >
            {icons[t.type]}
            <div className="flex-1">
              <div className="text-text font-medium">{t.title}</div>
              {t.description && (
                <div className="text-subtle text-[11px] mt-0.5">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-subtle hover:text-text p-0.5 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
