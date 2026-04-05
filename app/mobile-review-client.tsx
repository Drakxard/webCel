"use client"

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react"

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
  theoryCountdownDays: number | null
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

type Props = {
  deviceId: string
  signature: string
  initialPayload: MobileReviewPayload | null
  initialError: string
  requiresAccess?: boolean
}

type ReviewDirection = "forward" | "backward"
type SwipeGestureState = { x: number; y: number } | null

function isSwipeBlocked(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest("audio, button, input, select, textarea, a, [data-no-swipe='true']"))
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
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallPromptLoading, setIsInstallPromptLoading] = useState(false)
  const [hasBeenInstalled, setHasBeenInstalled] = useState(false)
  const [isStandaloneMode, setIsStandaloneMode] = useState(false)
  const shownTaskKeyRef = useRef("")
  const revealedTaskKeyRef = useRef("")
  const ratedTaskKeyRef = useRef("")
  const swipeStartRef = useRef<SwipeGestureState>(null)

  const activeTask = payload?.task ?? null
  const activePair = activeTask?.pair ?? null
  const activeTaskKey = activeTask
    ? `${activeTask.kind}:${activeTask.subjectId}:${activeTask.material?.id ?? "none"}:${activeTask.pair?.pairId ?? "none"}:${activeTask.theoryCountdownDays ?? "none"}`
    : ""
  const pairCounter = `${payload?.currentIndex ?? 0}/${payload?.totalPairs ?? 0}`
  const shouldShowInstallCallout = !isStandaloneMode && !hasBeenInstalled
  const canInstallApp = shouldShowInstallCallout && Boolean(installPromptEvent)

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

  const loadNext = async (
    endpoint: "/api/mobile/review/next" | "/api/mobile/review/next-pair",
    direction: ReviewDirection = "forward"
  ) => {
    if (isLoading) return

    setIsLoading(true)
    setError("")
    if (activeTask && !ratedTaskKeyRef.current) {
      void postInteractionEvent({ task: activeTask, eventType: "skipped" })
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceId, sig: signature, direction }),
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

  const handleSwipeAudio = useCallback((direction: ReviewDirection) => {
    if (!payload?.totalPairs) return
    void loadNext("/api/mobile/review/next-pair", direction)
  }, [payload?.totalPairs])

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (isSwipeBlocked(event.target)) {
      swipeStartRef.current = null
      return
    }

    const touch = event.changedTouches[0]
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start || isSwipeBlocked(event.target)) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX < 48 || absX <= absY * 1.2) return
    handleSwipeAudio(deltaX < 0 ? "forward" : "backward")
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
            <button
              type="button"
              onClick={() => void loadNext("/api/mobile/review/next", "backward")}
              disabled={isLoading}
              className="h-10 w-10 border-2 border-black bg-[#f7ecc0] text-xl leading-none disabled:opacity-60"
            >
              {"<"}
            </button>
            <div className="text-center text-[1.9rem] leading-[1.05]">{activeTask?.subjectName || payload?.status.subjectName || "Sin materia"}</div>
            <button
              type="button"
              onClick={() => void loadNext("/api/mobile/review/next", "forward")}
              disabled={isLoading}
              className="h-10 w-10 border-2 border-black bg-[#f7ecc0] text-xl leading-none disabled:opacity-60"
            >
              {">"}
            </button>
          </header>

          <div className="overflow-y-auto" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="space-y-5">
              {activeTask ? (
                <section className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-[0.78rem] uppercase tracking-[0.16em]">
                    {activeTask.theoryCountdownDays !== null ? (
                      <span className="border border-black px-2 py-1">{`${activeTask.theoryCountdownDays}d`}</span>
                    ) : null}
                    {activeTask.material ? <span className="max-w-[16rem] truncate border border-black px-2 py-1">{activeTask.material.fileName}</span> : null}
                  </div>
                  <p className="text-sm leading-relaxed text-black/80">{activeTask.instruction}</p>
                </section>
              ) : null}

              {activePair ? (
                <>
                  <section className="space-y-2">
                    <p className="text-[1.9rem] leading-none">{activeTask?.kind === "subject_anchor" ? "Ancla" : "Pregunta"}</p>
                    <audio
                      src={activePair.questionAudioUrl}
                      preload="metadata"
                      controls
                      data-no-swipe="true"
                      className="block w-full rounded-md border border-black/40 bg-[#f7ecc0]"
                    />
                  </section>

                  {isAnswerVisible ? (
                    <section className="space-y-2">
                      <p className="text-[1.9rem] leading-none">Respuesta</p>
                      <audio
                        src={activePair.answerAudioUrl}
                        preload="metadata"
                        controls
                        data-no-swipe="true"
                        className="block w-full rounded-md border border-black/40 bg-[#f7ecc0]"
                      />
                    </section>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void revealAnswer()}
                      data-no-swipe="true"
                      className="w-full border-2 border-black bg-[#f7ecc0] px-4 py-4 text-left text-[1.4rem] leading-none"
                    >
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
          </div>

          <div className="space-y-4">
            {activePair && isAnswerVisible ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void rateTask("ok")} disabled={isEventLoading || isLoading} className="border-2 border-black bg-[#f7ecc0] px-3 py-2 text-sm">Salio</button>
                <button type="button" onClick={() => void rateTask("doubt")} disabled={isEventLoading || isLoading} className="border-2 border-black bg-[#f7ecc0] px-3 py-2 text-sm">Dude</button>
                <button type="button" onClick={() => void rateTask("fail")} disabled={isEventLoading || isLoading} className="border-2 border-black bg-[#f7ecc0] px-3 py-2 text-sm">Falle</button>
              </div>
            ) : null}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button
                type="button"
                onClick={() => void loadNext("/api/mobile/review/next-pair", "backward")}
                disabled={isLoading || !payload?.totalPairs}
                className="border-2 border-black bg-[#f7ecc0] px-3 py-3 text-center text-[1.6rem] leading-none disabled:opacity-60"
              >
                {"<"}
              </button>
              <p className="text-center text-base leading-none text-black/80">{pairCounter}</p>
              <button
                type="button"
                onClick={() => void loadNext("/api/mobile/review/next-pair", "forward")}
                disabled={isLoading || !payload?.totalPairs}
                className="border-2 border-black bg-[#f7ecc0] px-3 py-3 text-center text-[1.6rem] leading-none disabled:opacity-60"
              >
                {">"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
