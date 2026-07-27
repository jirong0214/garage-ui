const { withXcodeProject } = require('expo/config-plugins');

const buildPhaseName = '[Garage UI] Enforce HTTPS for Release';

module.exports = function withReleaseAts(config) {
  return withXcodeProject(config, (configWithProject) => {
    const project = configWithProject.modResults;
    const targetName = configWithProject.modRequest.projectName;
    const nativeTargetId = project.findTargetKey(targetName ?? '');
    if (!nativeTargetId) {
      throw new Error(`Could not find the iOS target "${targetName}" for Release ATS enforcement.`);
    }

    const buildPhases = project.pbxNativeTargetSection()[nativeTargetId]?.buildPhases ?? [];
    if (buildPhases.some((phase) => phase.comment === buildPhaseName)) {
      return configWithProject;
    }

    project.addBuildPhase([], 'PBXShellScriptBuildPhase', buildPhaseName, nativeTargetId, {
      shellPath: '/bin/sh',
      shellScript: `# Release builds must never inherit the Debug LAN HTTP exception.
if [ "$CONFIGURATION" != "Debug" ]; then
  PLIST_PATH="\${TARGET_BUILD_DIR}/\${INFOPLIST_PATH}"
  if [ ! -f "$PLIST_PATH" ]; then
    echo "error: Garage UI could not locate the built Info.plist for ATS enforcement."
    exit 1
  fi

  /usr/libexec/PlistBuddy -c "Set :NSAppTransportSecurity:NSAllowsArbitraryLoads false" "$PLIST_PATH" 2>/dev/null ||
    /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool false" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :NSAppTransportSecurity:NSAllowsLocalNetworking false" "$PLIST_PATH" 2>/dev/null ||
    /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool false" "$PLIST_PATH"

  ARBITRARY=$(/usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoads" "$PLIST_PATH")
  LOCAL=$(/usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSAllowsLocalNetworking" "$PLIST_PATH")
  if [ "$ARBITRARY" != "false" ] || [ "$LOCAL" != "false" ]; then
    echo "error: Garage UI Release ATS enforcement failed."
    exit 1
  fi
fi
`,
    });

    const targetPhases = project.pbxNativeTargetSection()[nativeTargetId]?.buildPhases ?? [];
    const addedIndex = targetPhases.findIndex((phase) => phase.comment === buildPhaseName);
    if (addedIndex >= 0) {
      const [addedPhase] = targetPhases.splice(addedIndex, 1);
      const firstEmbedIndex = targetPhases.findIndex((phase) =>
        /^Embed |^\[CP\] Embed /.test(phase.comment ?? ''),
      );
      targetPhases.splice(firstEmbedIndex >= 0 ? firstEmbedIndex : targetPhases.length, 0, addedPhase);
    }

    return configWithProject;
  });
};
