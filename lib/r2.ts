import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3"

import { RemoteFileNotFoundError } from "@/lib/remote-file-errors"

const R2_KEY_PREFIX = "r2/"

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  })
}

function getBucketName() {
  return requireEnv("R2_BUCKET_NAME")
}

function isR2ObjectNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false

  const maybeError = error as {
    name?: string
    code?: string
    Code?: string
    $metadata?: { httpStatusCode?: number }
  }

  return (
    maybeError.$metadata?.httpStatusCode === 404 ||
    maybeError.name === "NoSuchKey" ||
    maybeError.name === "NotFound" ||
    maybeError.code === "NoSuchKey" ||
    maybeError.code === "NotFound" ||
    maybeError.Code === "NoSuchKey" ||
    maybeError.Code === "NotFound"
  )
}

export function isR2ObjectKey(value: string) {
  return value.startsWith(R2_KEY_PREFIX)
}

export async function getR2ObjectMetadata(objectKey: string) {
  const client = createR2Client()
  let response

  try {
    response = await client.send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: objectKey,
      })
    )
  } catch (error) {
    if (isR2ObjectNotFoundError(error)) {
      throw new RemoteFileNotFoundError("r2", objectKey, "The R2 object does not exist.")
    }

    throw error
  }

  return {
    id: objectKey,
    name: response.Metadata?.["original-file-name"] || objectKey.split("/").at(-1) || objectKey,
    mimeType: response.ContentType || "application/octet-stream",
  }
}

export async function downloadR2Object(objectKey: string) {
  const client = createR2Client()
  let response

  try {
    response = await client.send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: objectKey,
      })
    )
  } catch (error) {
    if (isR2ObjectNotFoundError(error)) {
      throw new RemoteFileNotFoundError("r2", objectKey, "The R2 object does not exist.")
    }

    throw error
  }

  if (!response.Body) {
    throw new Error("R2 object download returned an empty body.")
  }

  const bytes = await response.Body.transformToByteArray()
  return {
    buffer: Buffer.from(bytes),
    mimeType: response.ContentType || "application/octet-stream",
  }
}
