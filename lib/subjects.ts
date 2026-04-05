export type SubjectDefinition = {
  id: string
  name: string
  color: string
  index: number
}

export const SUBJECTS: SubjectDefinition[] = [
  { id: "algebra", name: "Algebra 2", color: "#0098C8", index: 0 },
  { id: "calculo2", name: "Calculo 2", color: "#2563eb", index: 1 },
  { id: "calculo3", name: "Calculo 3", color: "#ea580c", index: 2 },
  { id: "fisica", name: "Fisica 1", color: "#dc2626", index: 3 },
  { id: "logica", name: "Logica y\ncomputabilidad", color: "#16a34a", index: 4 },
  { id: "probabilidad", name: "Probabilidad y\nEstadistica", color: "#a855f7", index: 5 },
]

export const SUBJECT_IDS = SUBJECTS.map((subject) => subject.id)

export function isValidSubjectId(subjectId: string) {
  return SUBJECT_IDS.includes(subjectId)
}

export function getSubjectById(subjectId: string) {
  return SUBJECTS.find((subject) => subject.id === subjectId) ?? null
}
