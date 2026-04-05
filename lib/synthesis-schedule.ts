const SYNTHESIS_THEORY_WEEKDAY: Partial<Record<string, number>> = {
  calculo3: 0,
  fisica: 0,
  probabilidad: 1,
  logica: 4,
}

export function getSynthesisTheoryWeekday(subjectId: string) {
  return SYNTHESIS_THEORY_WEEKDAY[subjectId] ?? null
}
