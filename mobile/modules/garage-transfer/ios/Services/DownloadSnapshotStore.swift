import Foundation

final class DownloadSnapshotStore {
  private let defaults: UserDefaults
  private let storageKey = "dev.garageui.mobile.background-download.snapshots.v1"
  private let lock = NSLock()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func all() -> [DownloadSnapshot] {
    lock.withLock {
      Array(load().values).sorted { $0.transferId < $1.transferId }
    }
  }

  func snapshot(for transferId: String) -> DownloadSnapshot? {
    lock.withLock {
      load()[transferId]
    }
  }

  func save(_ snapshot: DownloadSnapshot) {
    lock.withLock {
      var snapshots = load()
      snapshots[snapshot.transferId] = snapshot
      persist(snapshots)
    }
  }

  func remove(transferId: String) {
    lock.withLock {
      var snapshots = load()
      snapshots.removeValue(forKey: transferId)
      persist(snapshots)
    }
  }

  private func load() -> [String: DownloadSnapshot] {
    guard
      let data = defaults.data(forKey: storageKey),
      let snapshots = try? JSONDecoder().decode([String: DownloadSnapshot].self, from: data)
    else {
      return [:]
    }
    return snapshots
  }

  private func persist(_ snapshots: [String: DownloadSnapshot]) {
    guard let data = try? JSONEncoder().encode(snapshots) else {
      return
    }
    defaults.set(data, forKey: storageKey)
  }
}
