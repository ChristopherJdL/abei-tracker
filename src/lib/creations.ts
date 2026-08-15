const DAILY_LIMIT_KEY = 'abei-daily-creations';
const MAX_CREATIONS_PER_DAY = 2;

interface DailyCreationData {
  date: string; // YYYY-MM-DD
  count: number;
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function canCreateSightingToday(): boolean {
  try {
    const raw = localStorage.getItem(DAILY_LIMIT_KEY);
    if (!raw) return true;

    const data: DailyCreationData = JSON.parse(raw);
    const today = getTodayString();

    if (data.date !== today) {
      return true;
    }

    return data.count < MAX_CREATIONS_PER_DAY;
  } catch {
    return true;
  }
}

export function recordSightingCreationToday(): void {
  try {
    const today = getTodayString();
    const raw = localStorage.getItem(DAILY_LIMIT_KEY);
    let count = 1;

    if (raw) {
      const data: DailyCreationData = JSON.parse(raw);
      if (data.date === today) {
        count = data.count + 1;
      }
    }

    const newData: DailyCreationData = { date: today, count };
    localStorage.setItem(DAILY_LIMIT_KEY, JSON.stringify(newData));
  } catch {
    // Ignore localStorage errors
  }
}
