import Foundation

final class ForegroundUploadManager: NSObject, URLSessionTaskDelegate {
  static let shared = ForegroundUploadManager()

  private let snapshotStore = UploadSnapshotStore()
  private let taskLock = NSLock()
  private var activeUploads: [Int: ActiveUpload] = [:]
  private var taskIdentifierByTransferId: [String: Int] = [:]
  private var supersededTaskIdentifiers: Set<Int> = []
  var onSnapshot: ((UploadSnapshot) -> Void)?

  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    let queue = OperationQueue()
    queue.name = "dev.garageui.mobile.foreground-upload-delegate"
    queue.maxConcurrentOperationCount = 1
    return URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
  }()

  private override init() {
    super.init()
  }

  func enqueue(
    transferId: String,
    urlString: String,
    sourceUri: String,
    fileName: String,
    contentType: String,
    objectKey: String,
    authorization: String
  ) throws -> UploadSnapshot {
    let requestURL = try validatedRequestURL(urlString)
    guard
      !authorization.isEmpty,
      !authorization.contains("\r"),
      !authorization.contains("\n")
    else {
      throw ForegroundUploadError.invalidAuthorization
    }
    guard UploadRequestSafety.isSafeObjectKey(objectKey) else {
      throw ForegroundUploadError.invalidObjectKey
    }

    let sourceURL = try validatedSourceURL(sourceUri)
    let stagedSourceURL = try stageSource(sourceURL, transferId: transferId)
    let sourceByteCount = try sourceFileSize(stagedSourceURL)
    let multipart = try MultipartBodyFile.create(
      sourceURL: stagedSourceURL,
      fileName: fileName,
      contentType: contentType,
      objectKey: objectKey
    )

    var request = URLRequest(url: requestURL)
    request.httpMethod = "POST"
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.setValue(authorization, forHTTPHeaderField: "Authorization")
    request.setValue(
      "multipart/form-data; boundary=\(multipart.boundary)",
      forHTTPHeaderField: "Content-Type"
    )

    supersedeExistingTask(transferId: transferId)
    let task = session.uploadTask(with: request, fromFile: multipart.url)
    let activeUpload = ActiveUpload(
      transferId: transferId,
      taskIdentifier: task.taskIdentifier,
      sourceURL: stagedSourceURL,
      multipartBodyURL: multipart.url,
      sourceByteCount: sourceByteCount
    )
    taskLock.withLock {
      activeUploads[task.taskIdentifier] = activeUpload
      taskIdentifierByTransferId[transferId] = task.taskIdentifier
    }

    let snapshot = UploadSnapshot(
      transferId: transferId,
      state: "uploading",
      bytesTransferred: 0,
      bytesTotal: sourceByteCount,
      localUri: stagedSourceURL.absoluteString,
      errorCode: nil
    )
    publish(snapshot)
    task.resume()
    return snapshot
  }

  func cancel(transferId: String) {
    let activeUpload: ActiveUpload? = taskLock.withLock {
      guard
        let taskIdentifier = taskIdentifierByTransferId.removeValue(forKey: transferId),
        let upload = activeUploads[taskIdentifier]
      else {
        return nil
      }
      supersededTaskIdentifiers.insert(taskIdentifier)
      return upload
    }

    if let activeUpload {
      session.getAllTasks { tasks in
        tasks.first(where: { $0.taskIdentifier == activeUpload.taskIdentifier })?.cancel()
      }
    }

    let previous = snapshotStore.snapshot(for: transferId)
    guard activeUpload != nil || previous?.state == "uploading" else {
      return
    }
    publish(
      UploadSnapshot(
        transferId: transferId,
        state: "cancelled",
        bytesTransferred: previous?.bytesTransferred ?? 0,
        bytesTotal: previous?.bytesTotal ?? activeUpload?.sourceByteCount ?? 0,
        localUri: previous?.localUri ?? activeUpload?.sourceURL.absoluteString,
        errorCode: nil
      )
    )
  }

  func snapshots() -> [UploadSnapshot] {
    snapshotStore.all()
  }

  func removeUploadSource(transferId: String) throws {
    supersedeExistingTask(transferId: transferId)
    let sourceURL = try SafeUploadPath.stagedSourceURL(transferId: transferId)
    let directory = sourceURL.deletingLastPathComponent()
    let fileManager = FileManager.default
    if fileManager.fileExists(atPath: directory.path) {
      try fileManager.removeItem(at: directory)
    }
    snapshotStore.remove(transferId: transferId)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64,
    totalBytesExpectedToSend: Int64
  ) {
    guard let upload = activeUpload(taskIdentifier: task.taskIdentifier) else {
      return
    }
    let sourceBytesSent: Int64
    if totalBytesExpectedToSend > 0 {
      let ratio = min(1, max(0, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
      sourceBytesSent = Int64(Double(upload.sourceByteCount) * ratio)
    } else {
      sourceBytesSent = min(upload.sourceByteCount, max(0, totalBytesSent))
    }
    publish(
      UploadSnapshot(
        transferId: upload.transferId,
        state: "uploading",
        bytesTransferred: sourceBytesSent,
        bytesTotal: upload.sourceByteCount,
        localUri: upload.sourceURL.absoluteString,
        errorCode: nil
      )
    )
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let upload = removeActiveUpload(taskIdentifier: task.taskIdentifier) else {
      return
    }
    try? FileManager.default.removeItem(at: upload.multipartBodyURL)

    if consumeSuperseded(taskIdentifier: task.taskIdentifier) {
      return
    }
    if snapshotStore.snapshot(for: upload.transferId)?.state == "cancelled" {
      return
    }
    if let response = task.response as? HTTPURLResponse,
       !(200...299).contains(response.statusCode) {
      publishFailure(upload: upload, code: "http_\(response.statusCode)")
      return
    }
    if let error {
      let nsError = error as NSError
      publishFailure(upload: upload, code: "\(nsError.domain):\(nsError.code)")
      return
    }

    try? FileManager.default.removeItem(at: upload.sourceURL.deletingLastPathComponent())
    publish(
      UploadSnapshot(
        transferId: upload.transferId,
        state: "completed",
        bytesTransferred: upload.sourceByteCount,
        bytesTotal: upload.sourceByteCount,
        localUri: nil,
        errorCode: nil
      )
    )
  }

  private func validatedRequestURL(_ value: String) throws -> URL {
    guard
      let url = URL(string: value),
      let scheme = url.scheme?.lowercased(),
      url.host?.isEmpty == false
    else {
      throw ForegroundUploadError.invalidUploadURL
    }
    guard scheme == "https" || scheme == "http" else {
      throw ForegroundUploadError.invalidUploadURL
    }
    if scheme == "http" {
      #if DEBUG
      guard
        let host = url.host,
        UploadRequestSafety.isDebugHttpHostAllowed(host)
      else {
        throw ForegroundUploadError.insecureUploadURL
      }
      #else
      throw ForegroundUploadError.insecureUploadURL
      #endif
    }
    return url
  }

  private func validatedSourceURL(_ value: String) throws -> URL {
    guard let url = URL(string: value), url.isFileURL else {
      throw ForegroundUploadError.invalidSourceURL
    }
    let fileManager = FileManager.default
    var isDirectory: ObjCBool = false
    guard
      fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory),
      !isDirectory.boolValue
    else {
      throw ForegroundUploadError.sourceFileUnavailable
    }
    return url.standardizedFileURL
  }

  private func stageSource(_ sourceURL: URL, transferId: String) throws -> URL {
    let destination = try SafeUploadPath.stagedSourceURL(transferId: transferId)
    if sourceURL.standardizedFileURL == destination.standardizedFileURL {
      return destination
    }

    let fileManager = FileManager.default
    try fileManager.createDirectory(
      at: destination.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    if fileManager.fileExists(atPath: destination.path) {
      try fileManager.removeItem(at: destination)
    }
    let accessed = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if accessed {
        sourceURL.stopAccessingSecurityScopedResource()
      }
    }
    try fileManager.copyItem(at: sourceURL, to: destination)
    return destination
  }

  private func sourceFileSize(_ url: URL) throws -> Int64 {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard let size = attributes[.size] as? NSNumber else {
      throw ForegroundUploadError.sourceFileUnavailable
    }
    return size.int64Value
  }

  private func supersedeExistingTask(transferId: String) {
    let taskIdentifier: Int? = taskLock.withLock {
      guard let taskIdentifier = taskIdentifierByTransferId.removeValue(forKey: transferId) else {
        return nil
      }
      supersededTaskIdentifiers.insert(taskIdentifier)
      return taskIdentifier
    }
    guard let taskIdentifier else {
      return
    }
    session.getAllTasks { tasks in
      tasks.first(where: { $0.taskIdentifier == taskIdentifier })?.cancel()
    }
  }

  private func activeUpload(taskIdentifier: Int) -> ActiveUpload? {
    taskLock.withLock {
      activeUploads[taskIdentifier]
    }
  }

  private func removeActiveUpload(taskIdentifier: Int) -> ActiveUpload? {
    taskLock.withLock {
      guard let upload = activeUploads.removeValue(forKey: taskIdentifier) else {
        return nil
      }
      if taskIdentifierByTransferId[upload.transferId] == taskIdentifier {
        taskIdentifierByTransferId.removeValue(forKey: upload.transferId)
      }
      return upload
    }
  }

  private func consumeSuperseded(taskIdentifier: Int) -> Bool {
    taskLock.withLock {
      supersededTaskIdentifiers.remove(taskIdentifier) != nil
    }
  }

  private func publishFailure(upload: ActiveUpload, code: String) {
    let previous = snapshotStore.snapshot(for: upload.transferId)
    publish(
      UploadSnapshot(
        transferId: upload.transferId,
        state: "failed",
        bytesTransferred: previous?.bytesTransferred ?? 0,
        bytesTotal: upload.sourceByteCount,
        localUri: upload.sourceURL.absoluteString,
        errorCode: code
      )
    )
  }

  private func publish(_ snapshot: UploadSnapshot) {
    snapshotStore.save(snapshot)
    DispatchQueue.main.async { [weak self] in
      self?.onSnapshot?(snapshot)
    }
  }
}
