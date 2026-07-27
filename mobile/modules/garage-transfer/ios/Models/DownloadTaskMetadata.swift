import Foundation

struct DownloadTaskMetadata: Codable {
  let transferId: String
  let fileName: String

  var encoded: String? {
    guard let data = try? JSONEncoder().encode(self) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  static func decode(_ value: String?) -> DownloadTaskMetadata? {
    guard let value, let data = value.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(Self.self, from: data)
  }
}
