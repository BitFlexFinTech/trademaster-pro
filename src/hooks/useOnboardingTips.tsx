import { useState, useCallback } from 'react';

const STORAGE_KEY = 'greenback-bots-onboarding-seen';

export function useOnboardingTips() {
  const [hasSeenBotsTips, setHasSeenBotsTips] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const markAsSeen = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasSeenBotsTips(true);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasSeenBotsTips(false);
  }, []);

  return { hasSeenBotsTips, markAsSeen, resetOnboarding };
}
