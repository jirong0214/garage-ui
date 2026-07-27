import Foundation

final class BackgroundDownloadManager: NSObject, URLSessionDownloadDelegate {
  static let shared = BackgroundDownloadManager()
  static let sessionIdentifier = "dev.garageui.mobile.background-downloads"

  private let snapshotStore = DownloadSnapshotStore()
  private let taskLock = NSLock()
  private var tasksByTransferId: [String: URLSessionDownloadTask] = [:]
  private var backgroundCompletionHandler: (() -> Void)?
  var onSnapshot: ((DownloadSnapshot) -> Void)?

  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(
      withIdentifier: Self.sessionIdentifier
    )
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    configuration.allowsCellularAccess = true
    let queue = OperationQueue()
    queue.name = "dev.garageui.mobile.background-download-delegate"
    queue.maxConcurrentOperationCount = 1
    return URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
  }()

  private override init() {
    super.init()
    restoreTasks()
  }

  func enqueue(transferId: String, urlString: String, fileName: String) throws -> DownloadSnapshot {
    guard
      let url = URL(string: urlString),
      let url = URL(string: urlString),
      let scheme = url.scheme?.lowercased()
    else {
      throw GarageTransferError.invalidDownloadUrl
    }
    if scheme != "https" {
      #if DEBUG
      guard scheme == "http" else {
        throw GarageTransferError.invalidDownloadUrl
      }
      #else
      throw GarageTransferError.insecureDownloadUrl
      #endif
    }

    let metadata = DownloadTaskMetadata(
      transferId: transferId,
      fileName: SafeDownloadFilename.sanitize(fileName)
    )
    guard let encodedMetadata = metadata.encoded else {
      throw GarageTransferError.invalidTaskMetadata
    }

    taskLock.withLock {
      tasksByTransferId[transferId]?.cancel()
    }

    let task = session.downloadTask(with: url)
    task.taskDescription = encodedMetadata
    taskLock.withLock {
      tasksByTransferId[transferId] = task
    }
    let snapshot = DownloadSnapshot(
      transferId: transferId,
      state: "downloading",
      bytesTransferred: 0,
      bytesTotal: nil,
      localUri: nil,
      errorCode: nil
    )
    publish(snapshot)
    task.resume()
    return snapshot
  }

  func cancel(transferId: String) {
    let task = taskLock.withLock {
      tasksByTransferId.removeValue(forKey: transferId)
    }
    task?.cancel()
    var snapshot = snapshotStore.snapshot(for: transferId) ?? DownloadSnapshot(
      transferId: transferId,
      state: "cancelled",
      bytesTransferred: 0,
      bytesTotal: nil,
      localUri: nil,
      errorCode: nil
    )
    snapshot.state = "cancelled"
    snapshot.errorCode = nil
    publish(snapshot)
  }

  func snapshots() -> [DownloadSnapshot] {
    snapshotStore.all()
  }

  func removeDownloadedFile(transferId: String) {
    if let localUri = snapshotStore.snapshot(for: transferId)?.localUri,
       let url = URL(string: localUri),
       url.isFileURL {
      try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }
    snapshotStore.remove(transferId: transferId)
  }

  func registerBackgroundCompletionHandler(
    identifier: String,
    completionHandler: @escaping () -> Void
  ) -> Bool {
    guard identifier == Self.sessionIdentifier else {
      return false
    }
    backgroundCompletionHandler = completionHandler
    _ = session
    return true
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    guard let metadata = DownloadTaskMetadata.decode(downloadTask.taskDescription) else {
      return
    }
    let expected = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil
    let snapshot = DownloadSnapshot(
      transferId: metadata.transferId,
      state: "downloading",
      bytesTransferred: max(0, totalBytesWritten),
      bytesTotal: expected,
      localUri: nil,
      errorCode: nil
    )
    publish(snapshot)
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    guard let metadata = DownloadTaskMetadata.decode(downloadTask.taskDescription) else {
      return
    }

    if let response = downloadTask.response as? HTTPURLResponse,
       !(200...299).contains(response.statusCode) {
      publishFailure(
        transferId: metadata.transferId,
        code: "http_\(response.statusCode)",
        task: downloadTask
      )
      return
    }

    do {
      let destination = try destinationUrl(for: metadata)
      let fileManager = FileManager.default
      try fileManager.createDirectory(
        at: destination.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      if fileManager.fileExists(atPath: destination.path) {
        try fileManager.removeItem(at: destination)
      }
      try fileManager.moveItem(at: location, to: destination)
      let total = downloadTask.countOfBytesExpectedToReceive > 0
        ? downloadTask.countOfBytesExpectedToReceive
        : downloadTask.countOfBytesReceived
      publish(
        DownloadSnapshot(
          transferId: metadata.transferId,
          state: "completed",
          bytesTransferred: max(0, downloadTask.countOfBytesReceived),
          bytesTotal: total > 0 ? total : nil,
          localUri: destination.absoluteString,
          errorCode: nil
        )
      )
    } catch {
      publishFailure(
        transferId: metadata.transferId,
        code: "file_move_failed",
        task: downloadTask
      )
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let metadata = DownloadTaskMetadata.decode(task.taskDescription) else {
      return
    }
    taskLock.withLock {
      tasksByTransferId.removeValue(forKey: metadata.transferId)
    }
    guard let error else {
      return
    }
    if snapshotStore.snapshot(for: metadata.transferId)?.state == "cancelled" {
      return
    }
    let nsError = error as NSError
    publishFailure(
      transferId: metadata.transferId,
      code: "\(nsError.domain):\(nsError.code)",
      task: task
    )
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    guard let completionHandler = backgroundCompletionHandler else {
      return
    }
    backgroundCompletionHandler = nil
    DispatchQueue.main.async {
      completionHandler()
    }
  }

  private func restoreTasks() {
    session.getAllTasks { [weak self] tasks in
      guard let self else {
        return
      }
      self.taskLock.withLock {
        for task in tasks {
          guard
            let downloadTask = task as? URLSessionDownloadTask,
            let metadata = DownloadTaskMetadata.decode(task.taskDescription)
          else {
            continue
          }
          self.tasksByTransferId[metadata.transferId] = downloadTask
        }
      }
    }
  }

  private func publishFailure(transferId: String, code: String, task: URLSessionTask) {
    let expected = task.countOfBytesExpectedToReceive > 0
      ? task.countOfBytesExpectedToReceive
      : nil
    publish(
      DownloadSnapshot(
        transferId: transferId,
        state: "failed",
        bytesTransferred: max(0, task.countOfBytesReceived),
        bytesTotal: expected,
        localUri: nil,
        errorCode: code
      )
    )
  }

  private func publish(_ snapshot: DownloadSnapshot) {
    snapshotStore.save(snapshot)
    DispatchQueue.main.async { [weak self] in
      self?.onSnapshot?(snapshot)
    }
  }

  private func destinationUrl(for metadata: DownloadTaskMetadata) throws -> URL {
    guard let documents = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask
    ).first else {
      throw GarageTransferError.documentsDirectoryUnavailable
    }
    return documents
      .appendingPathComponent("GarageUIDownloads", isDirectory: true)
      .appendingPathComponent(metadata.transferId, isDirectory: true)
      .appendingPathComponent(metadata.fileName, isDirectory: false)
  }
}

enum GarageTransferError: Error {
  case invalidDownloadUrl
  case insecureDownloadUrl
  case invalidTaskMetadata
  case documentsDirectoryUnavailable
}
