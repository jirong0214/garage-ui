import Foundation

enum ForegroundUploadError: Error {
  case invalidTransferId
  case invalidUploadURL
  case insecureUploadURL
  case invalidSourceURL
  case sourceFileUnavailable
  case invalidAuthorization
  case invalidObjectKey
  case applicationSupportDirectoryUnavailable
  case multipartCreationFailed
}
