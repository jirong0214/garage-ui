import ExpoModulesCore

public final class GarageTransferModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GarageTransfer")

    Events("onDownloadSnapshot")

    OnStartObserving {
      BackgroundDownloadManager.shared.onSnapshot = { [weak self] snapshot in
        self?.sendEvent("onDownloadSnapshot", snapshot.eventBody)
      }
    }

    OnStopObserving {
      BackgroundDownloadManager.shared.onSnapshot = nil
    }

    AsyncFunction("enqueueDownload") {
      (transferId: String, url: String, fileName: String) -> [String: Any?] in
      try BackgroundDownloadManager.shared.enqueue(
        transferId: transferId,
        urlString: url,
        fileName: fileName
      ).eventBody
    }

    AsyncFunction("cancelDownload") { (transferId: String) in
      BackgroundDownloadManager.shared.cancel(transferId: transferId)
    }

    AsyncFunction("getDownloadSnapshots") { () -> [[String: Any?]] in
      BackgroundDownloadManager.shared.snapshots().map(\.eventBody)
    }

    AsyncFunction("removeDownloadedFile") { (transferId: String) in
      BackgroundDownloadManager.shared.removeDownloadedFile(transferId: transferId)
    }
  }
}
