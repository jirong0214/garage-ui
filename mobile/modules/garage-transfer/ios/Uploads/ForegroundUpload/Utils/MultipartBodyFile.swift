import Foundation

enum MultipartBodyFile {
  static func create(
    sourceURL: URL,
    fileName: String,
    contentType: String,
    objectKey: String
  ) throws -> (url: URL, boundary: String) {
    let boundary = "GarageUI-\(UUID().uuidString)"
    let destination = sourceURL
      .deletingLastPathComponent()
      .appendingPathComponent("multipart-\(UUID().uuidString)", isDirectory: false)

    guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
      throw ForegroundUploadError.multipartCreationFailed
    }

    do {
      let output = try FileHandle(forWritingTo: destination)
      defer {
        try? output.close()
      }

      try output.write(contentsOf: data(
        "--\(boundary)\r\n"
          + "Content-Disposition: form-data; name=\"key\"\r\n\r\n"
          + objectKey
          + "\r\n"
      ))
      try output.write(contentsOf: data(
        "--\(boundary)\r\n"
          + "Content-Disposition: form-data; name=\"file\"; filename=\"\(safeHeaderFileName(fileName))\"\r\n"
          + "Content-Type: \(safeContentType(contentType))\r\n\r\n"
      ))

      let input = try FileHandle(forReadingFrom: sourceURL)
      defer {
        try? input.close()
      }
      while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
        try output.write(contentsOf: chunk)
      }
      try output.write(contentsOf: data("\r\n--\(boundary)--\r\n"))
      return (destination, boundary)
    } catch {
      try? FileManager.default.removeItem(at: destination)
      throw error
    }
  }

  private static func data(_ string: String) throws -> Data {
    guard let data = string.data(using: .utf8) else {
      throw ForegroundUploadError.multipartCreationFailed
    }
    return data
  }

  private static func safeHeaderFileName(_ value: String) -> String {
    let lastComponent = URL(fileURLWithPath: value).lastPathComponent
    let cleaned = lastComponent.unicodeScalars.map { scalar -> Character in
      if scalar.value < 0x20
        || scalar.value == 0x7f
        || scalar.value == 0x22
        || scalar.value == 0x5c {
        return "_"
      }
      return Character(scalar)
    }
    let result = String(cleaned)
    return result.isEmpty ? "upload" : result
  }

  private static func safeContentType(_ value: String) -> String {
    guard
      !value.isEmpty,
      !value.contains("\r"),
      !value.contains("\n")
    else {
      return "application/octet-stream"
    }
    return value
  }
}
