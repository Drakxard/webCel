export const WEEK_ONE_START = new Date(2026, 2, 14)
export const WEEK_TWO_START = new Date(2026, 2, 23)

export const WEEKDAY_NAMES = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

export function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getWeekNumberForDate(input: Date): number {
  const current = normalizeDate(input)
  if (current < WEEK_ONE_START) return 0
  if (current < WEEK_TWO_START) return 1

  const msPerDay = 1000 * 60 * 60 * 24
  const diffDays = Math.floor((current.getTime() - WEEK_TWO_START.getTime()) / msPerDay)
  return Math.floor(diffDays / 7) + 2
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function getWeekdayIndexFromDateKey(dateKey: string) {
  const date = parseDateKey(dateKey)
  const jsDay = date.getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}
