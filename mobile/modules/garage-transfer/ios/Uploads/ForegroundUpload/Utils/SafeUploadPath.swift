import Foundation

enum SafeUploadPath {
  private static let allowedTransferIdCharacters = CharacterSet(
    charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
  )

  static func validatedTransferId(_ value: String) throws -> String {
    guard
      !value.isEmpty,
      value.utf8.count <= 128,
      value.unicodeScalars.allSatisfy({ allowedTransferIdCharacters.contains($0) })
    else {
      throw ForegroundUploadError.invalidTransferId
    }
    return value
  }

  static func stagedSourceURL(transferId: String, fileManager: FileManager = .default) throws -> URL {
    let safeTransferId = try validatedTransferId(transferId)
    guard let applicationSupport = fileManager.urls(
      for: .applicationSupportDirectory,
      in: .userDomainMask
    ).first else {
      throw ForegroundUploadError.applicationSupportDirectoryUnavailable
    }
    return applicationSupport
      .appendingPathComponent("GarageUIUploads", isDirectory: true)
      .appendingPathComponent(safeTransferId, isDirectory: true)
      .appendingPathComponent("source", isDirectory: false)
  }
}
