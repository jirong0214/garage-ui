import ExpoModulesCore
import UIKit

public final class GarageTransferAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    let accepted = BackgroundDownloadManager.shared.registerBackgroundCompletionHandler(
      identifier: identifier,
      completionHandler: completionHandler
    )
    if !accepted {
      completionHandler()
    }
  }
}
