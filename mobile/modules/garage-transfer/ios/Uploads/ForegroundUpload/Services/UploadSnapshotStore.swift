import Foundation

final class UploadSnapshotStore {
  private let lock = NSLock()
  private var values: [String: UploadSnapshot] = [:]

  func save(_ snapshot: UploadSnapshot) {
    lock.withLock {
      values[snapshot.transferId] = snapshot
    }
  }

  func snapshot(for transferId: String) -> UploadSnapshot? {
    lock.withLock {
      values[transferId]
    }
  }

  func all() -> [UploadSnapshot] {
    lock.withLock {
      Array(values.values)
    }
  }

  func remove(transferId: String) {
    _ = lock.withLock {
      values.removeValue(forKey: transferId)
    }
  }
}
