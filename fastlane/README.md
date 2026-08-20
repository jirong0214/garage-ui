fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios check

```sh
[bundle exec] fastlane ios check
```

Validate Git, signing, Xcode, and Firebase prerequisites without building

### ios download_udids

```sh
[bundle exec] fastlane ios download_udids
```

Download tester UDIDs from Firebase without changing Apple Developer resources

### ios sync_devices

```sh
[bundle exec] fastlane ios sync_devices
```

Register changed Firebase tester devices and refresh the Ad Hoc profile

### ios build_adhoc

```sh
[bundle exec] fastlane ios build_adhoc
```

Build an Ad Hoc IPA locally without uploading it

### ios firebase_upload

```sh
[bundle exec] fastlane ios firebase_upload
```

Upload an existing Ad Hoc IPA to Firebase App Distribution

### ios firebase_beta

```sh
[bundle exec] fastlane ios firebase_beta
```

Build an Ad Hoc IPA locally and distribute it with Firebase App Distribution

### ios release

```sh
[bundle exec] fastlane ios release
```

Preflight, synchronize tester devices when needed, build, and distribute

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
