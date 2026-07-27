import Foundation

struct DownloadSnapshot: Codable {
  let transferId: String
  var state: String
  var bytesTransferred: Int64
  var bytesTotal: Int64?
  var localUri: String?
  var errorCode: String?

  var eventBody: [String: Any?] {
    [
      "transferId": transferId,
      "state": state,
      "bytesTransferred": bytesTransferred,
      "bytesTotal": bytesTotal,
      "localUri": localUri,
      "errorCode": errorCode
    ]
  }
}
