// Anno fiscale Amway: 1 settembre - 31 agosto.
export function getFiscalYearBounds(date: Date) {
  const month = date.getMonth(); // 0-indexed, 8 = settembre
  const startYear = month >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(startYear, 8, 1, 0, 0, 0),
    end: new Date(startYear + 1, 7, 31, 23, 59, 59, 999),
    startYear,
  };
}
