import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import ReportCelebration, { CelebrationConfig } from '../components/ReportCelebration';

interface ReportCelebrationApi {
  celebrate: (config: CelebrationConfig) => void;
}

const ReportCelebrationContext = createContext<ReportCelebrationApi | undefined>(undefined);

export function ReportCelebrationProvider({ children }: { children: ReactNode }) {
  const [celebration, setCelebration] = useState<CelebrationConfig | null>(null);

  const celebrate = useCallback((config: CelebrationConfig) => {
    setCelebration(config);
  }, []);

  const done = useCallback(() => setCelebration(null), []);

  return (
    <ReportCelebrationContext.Provider value={{ celebrate }}>
      {children}
      <ReportCelebration celebration={celebration} onDone={done} />
    </ReportCelebrationContext.Provider>
  );
}

export function useReportCelebration(): ReportCelebrationApi {
  const ctx = useContext(ReportCelebrationContext);
  if (!ctx) throw new Error('useReportCelebration must be used within a ReportCelebrationProvider');
  return ctx;
}
