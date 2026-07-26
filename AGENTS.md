# Garage UI Development Notes

## Mobile iOS validation

- The mobile app supports iOS 17 and later.
- Use the existing **iPhone SE (3rd generation), iOS 18.3** simulator for routine development and UI validation.
- Keep this small-screen simulator as the fixed primary target so layouts, Dynamic Type, safe areas, localization, and touch targets are tested under constrained width.
- Do not switch the primary validation device without updating this file and recording the reason.
- LAN HTTP endpoints are for Debug builds only. Release builds must require HTTPS.
