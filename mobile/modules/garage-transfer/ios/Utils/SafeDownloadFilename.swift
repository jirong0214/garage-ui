import Foundation

enum SafeDownloadFilename {
  static func sanitize(_ value: String) -> String {
    let candidate = URL(fileURLWithPath: value).lastPathComponent
    let cleaned = candidate
      .components(separatedBy: CharacterSet(charactersIn: "/\\:\0"))
      .joined(separator: "_")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty || cleaned == "." || cleaned == ".." ? "download" : cleaned
  }
}
