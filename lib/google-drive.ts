import { getGoogleAccessToken } from "@/lib/google-oauth"
import { RemoteFileNotFoundError } from "@/lib/remote-file-errors"

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files"

async function driveRequest(path: string, init?: RequestInit, options?: { fileId?: string }) {
  const accessToken = await getGoogleAccessToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  })

  if (response.status === 404 && options?.fileId) {
    throw new RemoteFileNotFoundError("drive", options.fileId, "The Google Drive file does not exist.")
  }

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(payload || "Google Drive request failed")
  }

  return response
}

export async function downloadDriveFile(fileId: string) {
  const response = await driveRequest(`${DRIVE_API_BASE}/${fileId}?alt=media`, undefined, { fileId })
  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get("content-type") || "application/octet-stream",
  }
}
