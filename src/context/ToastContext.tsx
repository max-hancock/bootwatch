import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import Toast, { ToastConfig } from '../components/Toast';

interface ToastApi {
  show: (config: ToastConfig) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const show = useCallback((config: ToastConfig) => {
    setToast(config);
  }, []);

  const hide = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      <Toast toast={toast} onDismiss={hide} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
