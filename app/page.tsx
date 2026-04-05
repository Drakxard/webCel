import { MobileReviewClient } from "@/app/mobile-review-client"
import { buildMobileReviewSignedQuery, verifyMobileReviewSignature } from "@/lib/mobile-review-auth"
import { getMobileReviewStatus, isMissingMobileReviewDependency, resolveMobileReviewPair, withSignedTaskAudioUrls } from "@/lib/mobile-review"

export const dynamic = "force-dynamic"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const deviceId = typeof params.device === "string" ? params.device.trim() : ""
  const signature = typeof params.sig === "string" ? params.sig.trim() : ""
  const hasValidAccess = deviceId && verifyMobileReviewSignature(deviceId, signature)

  if (!hasValidAccess) {
    return <MobileReviewClient deviceId="" signature="" initialPayload={null} initialError="" requiresAccess />
  }

  try {
    const resolved = await resolveMobileReviewPair({ deviceId })
    const authQuery = buildMobileReviewSignedQuery(deviceId)

    return (
      <MobileReviewClient
        deviceId={deviceId}
        signature={signature}
        initialPayload={{
          task: resolved.task ? withSignedTaskAudioUrls(resolved.task, authQuery) : null,
          status: await getMobileReviewStatus(deviceId),
          currentIndex: resolved.currentIndex,
          totalPairs: resolved.totalPairs,
          debugReason: resolved.debugReason,
        }}
        initialError=""
      />
    )
  } catch (error) {
    const message = isMissingMobileReviewDependency(error)
      ? "Faltan migraciones de mobile review en Neon."
      : error instanceof Error
        ? error.message
        : "No se pudo abrir el repaso movil."

    return (
      <MobileReviewClient
        deviceId={deviceId}
        signature={signature}
        initialPayload={null}
        initialError={message}
      />
    )
  }
}
