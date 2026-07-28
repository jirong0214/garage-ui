import Foundation

struct ActiveUpload {
  let transferId: String
  let taskIdentifier: Int
  let sourceURL: URL
  let multipartBodyURL: URL
  let sourceByteCount: Int64
}
