# Garage UI Mobile

Native React Native client for Garage UI. The current foundation targets iOS 17+ with Expo
Development Builds and Expo Router.

## Development

```bash
npm install
npm run typecheck
npm test
npm run lint
```

Normal builds require HTTPS. For local-network Debug development only:

```bash
GARAGE_UI_DEBUG_LAN_HTTP=1 npx expo prebuild --clean
npm run start:lan
```

The runtime accepts plaintext HTTP only for localhost, `.local`, private IP, and link-local IP
hosts. The generated native directories are intentionally ignored while the project uses Expo
Continuous Native Generation. When the background `URLSession` module is introduced, the iOS
native project strategy will be revisited and documented.

## Security boundaries

- JWTs are stored only in Expo SecureStore.
- Server profiles, transfer metadata, and cache indexes belong in Expo SQLite.
- Passwords are used only for the login request and are never persisted.
- Garage `admin_token` and S3 credentials are outside the mobile application boundary.
- Files under `../packages/api-client/src/generated` are generated and must not be edited.
