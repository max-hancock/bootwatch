import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import ReportCelebration, { CelebrationConfig } from '../components/ReportCelebration';
import { recordHappyMoment } from '../utils/storeReview';

interface ReportCelebrationApi {
  celebrate: (config: CelebrationConfig) => void;
}

const ReportCelebrationContext = createContext<ReportCelebrationApi | undefined>(undefined);

export function ReportCelebrationProvider({ children }: { children: ReactNode }) {
  const [celebration, setCelebration] = useState<CelebrationConfig | null>(null);

  const celebrate = useCallback((config: CelebrationConfig) => {
    setCelebration(config);
  }, []);

  // A report just went out and the celebration has closed: a good moment to
  // (rarely) ask for a rating. Not after "I got booted" — they're having a bad day.
  const done = useCallback(() => {
    if (celebration && celebration.reportType !== 'booted') recordHappyMoment();
    setCelebration(null);
  }, [celebration]);

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
