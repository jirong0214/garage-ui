import Darwin
import Foundation

enum UploadRequestSafety {
  static func isDebugHttpHostAllowed(_ hostname: String) -> Bool {
    let host = hostname
      .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
      .lowercased()
    if host == "localhost" || host.hasSuffix(".local") {
      return true
    }
    if isPrivateIPv4(host) {
      return true
    }
    return isPrivateOrLinkLocalIPv6(host)
  }

  static func isSafeObjectKey(_ value: String) -> Bool {
    !value.isEmpty
      && !value.unicodeScalars.contains(where: {
        $0.value == 0x00 || $0.value == 0x0a || $0.value == 0x0d
      })
  }

  private static func isPrivateIPv4(_ host: String) -> Bool {
    let components = host.split(separator: ".", omittingEmptySubsequences: false)
    guard components.count == 4 else {
      return false
    }
    let octets = components.compactMap { UInt8($0) }
    guard octets.count == components.count else {
      return false
    }
    return octets[0] == 10
      || octets[0] == 127
      || (octets[0] == 169 && octets[1] == 254)
      || (octets[0] == 172 && (16...31).contains(octets[1]))
      || (octets[0] == 192 && octets[1] == 168)
  }

  private static func isPrivateOrLinkLocalIPv6(_ host: String) -> Bool {
    var address = in6_addr()
    guard host.withCString({ inet_pton(AF_INET6, $0, &address) }) == 1 else {
      return false
    }
    let bytes = withUnsafeBytes(of: &address) { Array($0) }
    let isLoopback = bytes.dropLast().allSatisfy { $0 == 0 } && bytes.last == 1
    let isUniqueLocal = bytes[0] & 0xfe == 0xfc
    let isLinkLocal = bytes[0] == 0xfe && bytes[1] & 0xc0 == 0x80
    return isLoopback || isUniqueLocal || isLinkLocal
  }
}
