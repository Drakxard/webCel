"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { SUBJECTS } from "@/lib/subjects"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

type MobileReviewPair = {
  pairId: string
  questionEntryId: number
  questionAudioUrl: string
  questionLabel: string
  answerEntryId: number
  answerAudioUrl: string
  answerLabel: string
}

type MobileReviewTask = {
  kind: "material_pair" | "subject_anchor" | "coverage_gap"
  subjectId: string
  subjectName: string
  weekNumber: number
  vectorDay: number | null
  instruction: string
  staleReason: string[]
  material: {
    id: number
    fileName: string
    sessionDate: string
    status: "sin_tocar" | "tocado_sin_dupla" | "cubierto_minimo"
    isCheckupDone: boolean
  } | null
  pair: MobileReviewPair | null
  fallbackPair: MobileReviewPair | null
}

type MobileReviewStatus = {
  deviceId: string
  activeSlot: null
  subjectId: string | null
  subjectName: string | null
  weekNumber: number
  hasCurrentPair: boolean
  currentPairId: string | null
}

type MobileReviewPayload = {
  task: MobileReviewTask | null
  status: MobileReviewStatus
  currentIndex: number
  totalPairs: number
  debugReason?: "no_active_slot" | "no_valid_pairs" | "stored_pair_not_found"
}

type MobileReviewSlot = {
  id: number
  subjectId: string
  subjectName: string
  weekdayIndex: number
  startTime: string
  endTime: string
  enabled: boolean
  priority: number
}

type SlotFormState = {
  id: number | null
  subjectId: string
  weekdayIndex: string
  startTime: string
  endTime: string
  enabled: boolean
  priority: string
}

type Props = {
  deviceId: string
  signature: string
  initialPayload: MobileReviewPayload | null
  initialError: string
  requiresAccess?: boolean
}

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Lunes" },
  { value: "1", label: "Martes" },
  { value: "2", label: "Miercoles" },
  { value: "3", label: "Jueves" },
  { value: "4", label: "Viernes" },
  { value: "5", label: "Sabado" },
  { value: "6", label: "Domingo" },
]

function createEmptySlotForm(): SlotFormState {
  return {
    id: null,
    subjectId: SUBJECTS[0]?.id || "",
    weekdayIndex: "0",
    startTime: "09:00",
    endTime: "10:00",
    enabled: true,
    priority: "10",
  }
}

function mapSlotToForm(slot: MobileReviewSlot): SlotFormState {
  return {
    id: slot.id,
    subjectId: slot.subjectId,
    weekdayIndex: String(slot.weekdayIndex),
    startTime: slot.startTime,
    endTime: slot.endTime,
    enabled: slot.enabled,
    priority: String(slot.priority),
  }
}

function formatSlotLabel(slot: MobileReviewSlot) {
  const weekday = WEEKDAY_OPTIONS.find((option) => option.value === String(slot.weekdayIndex))?.label || "Dia"
  return `${weekday} ${slot.startTime}-${slot.endTime}`
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3">
      <div className="w-full max-w-[360px] border-4 border-black bg-[#f1e4a9] p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xl">{title}</p>
          <button type="button" onClick={onClose} className="border border-black px-2 py-1 text-sm">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function MobileReviewClient({ deviceId, signature, initialPayload, initialError, requiresAccess = false }: Props) {
  const [payload, setPayload] = useState(initialPayload)
  const [error, setError] = useState(initialError)
  const [accessDeviceId, setAccessDeviceId] = useState("")
  const [accessError, setAccessError] = useState("")
  const [isAccessLoading, setIsAccessLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAnswerVisible, setIsAnswerVisible] = useState(false)
  const [isEventLoading, setIsEventLoading] = useState(false)
  const [isSlotsOpen, setIsSlotsOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [slots, setSlots] = useState<MobileReviewSlot[]>([])
  const [slotsError, setSlotsError] = useState("")
  const [isSlotsLoading, setIsSlotsLoading] = useState(false)
  const [isSavingSlot, setIsSavingSlot] = useState(false)
  const [slotForm, setSlotForm] = useState<SlotFormState>(createEmptySlotForm)
  const [scheduleDayIndex, setScheduleDayIndex] = useState(0)
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallPromptLoading, setIsInstallPromptLoading] = useState(false)
  const [hasBeenInstalled, setHasBeenInstalled] = useState(false)
  const [isStandaloneMode, setIsStandaloneMode] = useState(false)
  const questionAudioRef = useRef<HTMLAudioElement | null>(null)
  const answerAudioRef = useRef<HTMLAudioElement | null>(null)
  const shownTaskKeyRef = useRef("")
  const revealedTaskKeyRef = useRef("")
  const ratedTaskKeyRef = useRef("")

  const activeTask = payload?.task ?? null
  const activePair = activeTask?.pair ?? null
  const activeTaskKey = activeTask
    ? `${activeTask.kind}:${activeTask.subjectId}:${activeTask.material?.id ?? "none"}:${activeTask.pair?.pairId ?? "none"}:${activeTask.vectorDay ?? 0}`
    : ""
  const pairCounter = `${payload?.currentIndex ?? 0}/${payload?.totalPairs ?? 0}`
  const shouldShowInstallCallout = !isStandaloneMode && !hasBeenInstalled
  const canInstallApp = shouldShowInstallCallout && Boolean(installPromptEvent)
  const slotsForSelectedDay = slots.filter((slot) => slot.weekdayIndex === scheduleDayIndex)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    void navigator.serviceWorker.register("/mobile-review-sw.js", { scope: "/" }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!requiresAccess) return
    try {
      const rememberedDeviceId = window.localStorage.getItem("mobile-review-device-id") || ""
      if (rememberedDeviceId) {
        setAccessDeviceId(rememberedDeviceId)
        void submitAccess(rememberedDeviceId, true)
      }
    } catch {}
  }, [requiresAccess])

  useEffect(() => {
    if (typeof window === "undefined") return

    const standaloneMedia = window.matchMedia("(display-mode: standalone)")
    const applyStandaloneState = () => {
      const iosNavigator = window.navigator as Navigator & { standalone?: boolean }
      const nextStandalone =
        standaloneMedia.matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        iosNavigator.standalone === true
      setIsStandaloneMode(nextStandalone)
      if (nextStandalone) {
        setHasBeenInstalled(true)
        setInstallPromptEvent(null)
      }
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent
      installEvent.preventDefault()
      setInstallPromptEvent(installEvent)
    }

    applyStandaloneState()
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener)
    window.addEventListener("appinstalled", applyStandaloneState)
    standaloneMedia.addEventListener("change", applyStandaloneState)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener)
      window.removeEventListener("appinstalled", applyStandaloneState)
      standaloneMedia.removeEventListener("change", applyStandaloneState)
    }
  }, [])

  const postInteractionEvent = useCallback(async (params: {
    task: MobileReviewTask
    eventType: "shown" | "revealed" | "rated" | "skipped"
    rating?: "ok" | "doubt" | "fail" | null
  }) => {
    const { task, eventType, rating = null } = params
    await fetch("/api/mobile/review/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device: deviceId,
        sig: signature,
        subjectId: task.subjectId,
        weekNumber: task.weekNumber,
        materialId: task.material?.id ?? null,
        pairId: task.pair?.pairId ?? null,
        taskKind: task.kind,
        eventType,
        rating,
      }),
    }).catch(() => undefined)
  }, [deviceId, signature])

  useEffect(() => {
    setIsAnswerVisible(false)
    revealedTaskKeyRef.current = ""
    ratedTaskKeyRef.current = ""

    if (!activeTask || !activeTaskKey || shownTaskKeyRef.current === activeTaskKey) return
    shownTaskKeyRef.current = activeTaskKey
    void postInteractionEvent({ task: activeTask, eventType: "shown" })
  }, [activeTask, activeTaskKey, postInteractionEvent])

  useEffect(() => {
    if (!activePair || !questionAudioRef.current) return
    questionAudioRef.current.currentTime = 0
    void questionAudioRef.current.play().catch(() => undefined)
  }, [activePair?.pairId])

  const submitAccess = async (deviceValue?: string, silent = false) => {
    const nextDeviceId = String(deviceValue ?? accessDeviceId).trim()
    if (!nextDeviceId) {
      if (!silent) setAccessError("Ingresa un nombre de dispositivo.")
      return
    }

    setIsAccessLoading(true)
    if (!silent) setAccessError("")
    try {
      const response = await fetch("/api/mobile/review/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: nextDeviceId }),
      })
      const result = (await response.json()) as { url?: string; deviceId?: string; error?: string }
      if (!response.ok || !result.url || !result.deviceId) {
        throw new Error(result.error || "No se pudo abrir el repaso movil.")
      }

      try {
        window.localStorage.setItem("mobile-review-device-id", result.deviceId)
      } catch {}

      window.location.assign(result.url)
    } catch (accessLoadError) {
      setAccessError(accessLoadError instanceof Error ? accessLoadError.message : "No se pudo abrir el repaso movil.")
    } finally {
      setIsAccessLoading(false)
    }
  }

  const refreshCurrent = async () => {
    const response = await fetch(`/api/mobile/review/current?device=${encodeURIComponent(deviceId)}&sig=${encodeURIComponent(signature)}`)
    const nextPayload = (await response.json()) as MobileReviewPayload & { error?: string }
    if (!response.ok) {
      throw new Error(nextPayload.error || "No se pudo actualizar el repaso.")
    }
    setPayload(nextPayload)
  }

  const loadNext = async (endpoint: "/api/mobile/review/next" | "/api/mobile/review/next-pair") => {
    setIsLoading(true)
    setError("")
    if (activeTask && !ratedTaskKeyRef.current) {
      void postInteractionEvent({ task: activeTask, eventType: "skipped" })
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceId, sig: signature }),
      })
      const nextPayload = (await response.json()) as MobileReviewPayload & { error?: string }
      if (!response.ok) {
        throw new Error(nextPayload.error || "No se pudo avanzar.")
      }
      setPayload(nextPayload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo avanzar.")
    } finally {
      setIsLoading(false)
    }
  }

  const revealAnswer = async () => {
    if (!activeTask || !activePair) return
    setIsAnswerVisible(true)
    if (revealedTaskKeyRef.current !== activeTaskKey) {
      revealedTaskKeyRef.current = activeTaskKey
      await postInteractionEvent({ task: activeTask, eventType: "revealed" })
    }
    if (answerAudioRef.current) {
      answerAudioRef.current.currentTime = 0
      void answerAudioRef.current.play().catch(() => undefined)
    }
  }

  const rateTask = async (rating: "ok" | "doubt" | "fail") => {
    if (!activeTask || isEventLoading) return
    setIsEventLoading(true)
    setError("")
    try {
      await postInteractionEvent({ task: activeTask, eventType: "rated", rating })
      ratedTaskKeyRef.current = activeTaskKey
      await loadNext("/api/mobile/review/next")
    } catch {
      setError("No se pudo guardar la valoracion.")
    } finally {
      setIsEventLoading(false)
    }
  }

  const loadSlots = async () => {
    setIsSlotsLoading(true)
    setSlotsError("")
    try {
      const response = await fetch(`/api/mobile/review/slots?device=${encodeURIComponent(deviceId)}&sig=${encodeURIComponent(signature)}`)
      const result = (await response.json()) as { slots?: MobileReviewSlot[]; error?: string }
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar las franjas.")
      setSlots(result.slots || [])
    } catch (slotsLoadError) {
      setSlotsError(slotsLoadError instanceof Error ? slotsLoadError.message : "No se pudieron cargar las franjas.")
    } finally {
      setIsSlotsLoading(false)
    }
  }

  const saveSlot = async () => {
    setIsSavingSlot(true)
    setSlotsError("")
    try {
      const response = await fetch(
        slotForm.id ? `/api/mobile/review/slots/${slotForm.id}` : "/api/mobile/review/slots",
        {
          method: slotForm.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device: deviceId,
            sig: signature,
            subjectId: slotForm.subjectId,
            weekdayIndex: Number(slotForm.weekdayIndex),
            startTime: slotForm.startTime,
            endTime: slotForm.endTime,
            enabled: slotForm.enabled,
            priority: Number(slotForm.priority),
          }),
        }
      )
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la franja.")
      setSlotForm(createEmptySlotForm())
      await Promise.all([loadSlots(), refreshCurrent()])
    } catch (saveError) {
      setSlotsError(saveError instanceof Error ? saveError.message : "No se pudo guardar la franja.")
    } finally {
      setIsSavingSlot(false)
    }
  }

  const toggleSlot = async (slot: MobileReviewSlot) => {
    setIsSavingSlot(true)
    setSlotsError("")
    try {
      const response = await fetch(`/api/mobile/review/slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device: deviceId,
          sig: signature,
          subjectId: slot.subjectId,
          weekdayIndex: slot.weekdayIndex,
          startTime: slot.startTime,
          endTime: slot.endTime,
          enabled: !slot.enabled,
          priority: slot.priority,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || "No se pudo actualizar la franja.")
      await Promise.all([loadSlots(), refreshCurrent()])
    } catch (toggleError) {
      setSlotsError(toggleError instanceof Error ? toggleError.message : "No se pudo actualizar la franja.")
    } finally {
      setIsSavingSlot(false)
    }
  }

  const deleteSlot = async (slot: MobileReviewSlot) => {
    setIsSavingSlot(true)
    setSlotsError("")
    try {
      const response = await fetch(`/api/mobile/review/slots/${slot.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceId, sig: signature }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || "No se pudo eliminar la franja.")
      if (slotForm.id === slot.id) setSlotForm(createEmptySlotForm())
      await Promise.all([loadSlots(), refreshCurrent()])
    } catch (deleteError) {
      setSlotsError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la franja.")
    } finally {
      setIsSavingSlot(false)
    }
  }

  const promptInstall = async () => {
    if (!installPromptEvent) return
    setIsInstallPromptLoading(true)
    try {
      await installPromptEvent.prompt()
      const choice = await installPromptEvent.userChoice.catch(() => null)
      if (choice?.outcome === "accepted") setHasBeenInstalled(true)
      setInstallPromptEvent(null)
    } finally {
      setIsInstallPromptLoading(false)
    }
  }

  if (requiresAccess) {
    return (
      <main className="min-h-screen bg-[#f1e4a9] px-3 py-3 text-black">
        <div className="mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[340px] flex-col border-4 border-black bg-[#f1e4a9] px-4 py-5">
          <div className="mb-6 text-center text-[1.9rem] leading-[1.05]">Repaso movil</div>
          <div className="flex-1 space-y-5">
            <p className="text-sm leading-relaxed">Escribe un nombre simple para este dispositivo y la web lo recordara para entrar sola la proxima vez.</p>
            <input
              type="text"
              value={accessDeviceId}
              onChange={(event) => setAccessDeviceId(event.target.value)}
              placeholder="celu-rafa"
              className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-3 text-base"
            />
            {accessError ? <p className="text-sm text-red-700">{accessError}</p> : null}
            {shouldShowInstallCallout ? (
              <div className="space-y-3 border-2 border-black bg-[#f7ecc0] p-3">
                <p className="text-sm">{canInstallApp ? "Chrome ya permite instalar esta app." : "Chrome todavia no habilito la instalacion."}</p>
                {canInstallApp ? (
                  <button type="button" onClick={() => void promptInstall()} className="w-full border-2 border-black bg-[#f1e4a9] px-3 py-3 text-left">
                    {isInstallPromptLoading ? "Abriendo instalacion..." : "Instalar app"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void submitAccess()}
            disabled={isAccessLoading}
            className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-3 text-left text-[1.4rem] leading-none disabled:opacity-60"
          >
            {isAccessLoading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f1e4a9] px-3 py-3 text-black">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[340px] flex-col border-4 border-black bg-[#f1e4a9] px-3 py-4">
        <div className="grid flex-1 grid-rows-[auto_1fr_auto] gap-6">
          <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3">
            <button type="button" onClick={() => { setIsSlotsOpen(true); void loadSlots() }} className="h-10 w-10 border-2 border-black bg-[#f7ecc0] text-sm">+</button>
            <div className="text-center text-[1.9rem] leading-[1.05]">{activeTask?.subjectName || payload?.status.subjectName || "Sin materia"}</div>
            <button type="button" onClick={() => { setIsScheduleOpen(true); void loadSlots() }} className="h-10 w-10 border-2 border-black bg-[#f7ecc0] text-xs">Ver</button>
          </header>

          <div className="space-y-5 overflow-y-auto">
            {activeTask ? (
              <section className="space-y-2">
                <div className="flex flex-wrap gap-2 text-[0.78rem] uppercase tracking-[0.16em]">
                  <span className="border border-black px-2 py-1">{activeTask.kind === "material_pair" ? "PDF" : activeTask.kind === "subject_anchor" ? "Ancla" : "Cobertura"}</span>
                  {activeTask.vectorDay ? <span className="border border-black px-2 py-1">{`D${activeTask.vectorDay}`}</span> : null}
                  {activeTask.material ? <span className="max-w-[11rem] truncate border border-black px-2 py-1">{activeTask.material.fileName}</span> : null}
                </div>
                <p className="text-sm leading-relaxed text-black/80">{activeTask.instruction}</p>
              </section>
            ) : null}

            {activePair ? (
              <>
                <section className="space-y-2">
                  <p className="text-[1.9rem] leading-none">{activeTask?.kind === "subject_anchor" ? "Ancla" : "Pregunta"}</p>
                  <audio ref={questionAudioRef} src={activePair.questionAudioUrl} preload="auto" controls className="block w-full rounded-md border border-black/40 bg-[#f7ecc0]" />
                </section>

                {isAnswerVisible ? (
                  <section className="space-y-2">
                    <p className="text-[1.9rem] leading-none">Respuesta</p>
                    <audio ref={answerAudioRef} src={activePair.answerAudioUrl} preload="auto" controls className="block w-full rounded-md border border-black/40 bg-[#f7ecc0]" />
                  </section>
                ) : (
                  <button type="button" onClick={() => void revealAnswer()} className="w-full border-2 border-black bg-[#f7ecc0] px-4 py-4 text-left text-[1.4rem] leading-none">
                    Revelar respuesta
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-black/80">
                {error || (payload?.debugReason === "no_active_slot" ? "No hay una materia activa en este momento." : activeTask?.instruction || "No hay materias activas para esta semana.")}
              </p>
            )}

            {error && activePair ? <p className="text-sm text-red-700">{error}</p> : null}

            {activeTask?.staleReason?.length ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {activeTask.staleReason.map((reason) => (
                  <span key={reason} className="border border-black/60 px-2 py-1">
                    {reason.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <div className="space-y-3">
              <button type="button" onClick={() => void loadNext("/api/mobile/review/next")} disabled={isLoading} className="block text-left text-[1.9rem] leading-none disabled:opacity-60">
                {isLoading ? "Cargando..." : "Siguiente materia"}
              </button>
              {activePair && isAnswerVisible ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void rateTask("ok")} disabled={isEventLoading || isLoading} className="border-2 border-black bg-[#f7ecc0] px-3 py-2 text-sm">Salio</button>
                  <button type="button" onClick={() => void rateTask("doubt")} disabled={isEventLoading || isLoading} className="border-2 border-black bg-[#f7ecc0] px-3 py-2 text-sm">Dude</button>
                  <button type="button" onClick={() => void rateTask("fail")} disabled={isEventLoading || isLoading} className="border-2 border-black bg-[#f7ecc0] px-3 py-2 text-sm">Falle</button>
                </div>
              ) : null}
              <button type="button" onClick={() => void loadNext("/api/mobile/review/next-pair")} disabled={isLoading || !payload?.totalPairs} className="text-left text-[1.9rem] leading-none disabled:opacity-60">
                {isLoading ? "Cargando..." : "Siguiente audio"}
              </button>
            </div>
            <p className="text-base leading-none text-black/80">{pairCounter}</p>
          </div>
        </div>
      </div>

      <Modal open={isSlotsOpen} title="Editar franja" onClose={() => setIsSlotsOpen(false)}>
        <div className="space-y-3">
          <select value={slotForm.subjectId} onChange={(event) => setSlotForm((current) => ({ ...current, subjectId: event.target.value }))} className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-2">
            {SUBJECTS.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name.replace("\n", " ")}</option>
            ))}
          </select>
          <select value={slotForm.weekdayIndex} onChange={(event) => setSlotForm((current) => ({ ...current, weekdayIndex: event.target.value }))} className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-2">
            {WEEKDAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" value={slotForm.startTime} onChange={(event) => setSlotForm((current) => ({ ...current, startTime: event.target.value }))} className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-2" />
            <input type="time" value={slotForm.endTime} onChange={(event) => setSlotForm((current) => ({ ...current, endTime: event.target.value }))} className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-2" />
          </div>
          <input type="number" value={slotForm.priority} onChange={(event) => setSlotForm((current) => ({ ...current, priority: event.target.value }))} className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-2" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={slotForm.enabled} onChange={(event) => setSlotForm((current) => ({ ...current, enabled: event.target.checked }))} />
            Activa
          </label>
          {slotsError ? <p className="text-sm text-red-700">{slotsError}</p> : null}
          <button type="button" onClick={() => void saveSlot()} disabled={isSavingSlot} className="w-full border-2 border-black bg-[#f7ecc0] px-3 py-3 text-left disabled:opacity-60">
            {isSavingSlot ? "Guardando..." : slotForm.id ? "Guardar cambios" : "Crear franja"}
          </button>
        </div>
      </Modal>

      <Modal open={isScheduleOpen} title="Franjas" onClose={() => setIsScheduleOpen(false)}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => setScheduleDayIndex(Number(option.value))} className="border border-black px-2 py-1 text-sm">
                {option.label}
              </button>
            ))}
          </div>
          {isSlotsLoading ? <p className="text-sm">Cargando...</p> : null}
          {slotsError ? <p className="text-sm text-red-700">{slotsError}</p> : null}
          <div className="max-h-[40vh] space-y-2 overflow-y-auto">
            {slotsForSelectedDay.length === 0 && !isSlotsLoading ? <p className="text-sm text-black/70">No hay franjas para este dia.</p> : null}
            {slotsForSelectedDay.map((slot) => (
              <div key={slot.id} className="space-y-2 border-2 border-black/80 bg-[#f7ecc0] p-3">
                <div>
                  <p className="text-sm font-semibold">{slot.subjectName}</p>
                  <p className="text-sm">{formatSlotLabel(slot)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <button type="button" onClick={() => { setSlotForm(mapSlotToForm(slot)); setIsScheduleOpen(false); setIsSlotsOpen(true) }} className="border border-black px-2 py-1">Editar</button>
                  <button type="button" onClick={() => void toggleSlot(slot)} className="border border-black px-2 py-1">{slot.enabled ? "Desactivar" : "Activar"}</button>
                  <button type="button" onClick={() => void deleteSlot(slot)} className="border border-black px-2 py-1">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </main>
  )
}
