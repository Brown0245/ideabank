# Menu Planner

A React Native app for iPhone, Android and web, built with Expo. Choose from 21 starter dishes to create a combined grocery checklist. Add custom ingredients and save your list on your device or browser automatically. Ingredient quantities are not calculated. Lists are stored locally and do not sync between devices.

## Run in a browser

```sh
npm ci
npm run web
```

Expo opens the browser on your computer. For a deployable static website, run `npm run build:web`; the generated site is in `dist/`. Serve that folder over HTTP rather than opening its HTML directly. Publishing the site requires a web host and is separate from publishing the development environment.

## Run on a phone

Use Node.js 22.13 or newer and install the matching Expo Go app on your phone.

```sh
npm ci
npm start
```

Scan the QR code with Expo Go on Android or Camera on iPhone. The phone must be able to reach the development machine over the network. For a remote cloud machine, a supported tunnel or a separate development build may be necessary; localhost is not reachable from your phone.

`npm run android` opens an available Android emulator. `npm run ios` requires macOS with Xcode. Native device testing is still required before release.

## Validate

```sh
npm test
npx expo export --platform android --platform ios
```

Recipes live in `recipes.js`. Add new dishes there; no online service or API key is needed.
