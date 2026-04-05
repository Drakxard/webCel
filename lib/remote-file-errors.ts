export class RemoteFileNotFoundError extends Error {
  provider: "r2" | "drive"
  remoteId: string

  constructor(provider: "r2" | "drive", remoteId: string, message?: string) {
    super(message || "The remote file was not found.")
    this.name = "RemoteFileNotFoundError"
    this.provider = provider
    this.remoteId = remoteId
  }
}

export class RemoteProviderAuthError extends Error {
  provider: "r2" | "drive"

  constructor(provider: "r2" | "drive", message?: string) {
    super(message || "The remote provider authentication failed.")
    this.name = "RemoteProviderAuthError"
    this.provider = provider
  }
}
