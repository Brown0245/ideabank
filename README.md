# Menu Planner

A meal planner for web, iPhone and Android. Enter a meal, press **Generate grocery list**, and AI suggests its ingredients. Select your meals to build one grocery checklist, add extra ingredients, and check items off as you shop.

The app also includes 21 starter dishes that work without AI. Meals and groceries are saved on your device or browser; they do not sync between devices. Lists contain ingredient names rather than quantities. AI suggestions can vary, so review the ingredients for your recipe, servings and dietary needs.

## Update your copy

Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org), then open Terminal. If you already cloned the project, update that copy:

```sh
cd ~/ideabank
git pull
npm ci
```

If npm reports a permissions error for its cache, use a new cache instead:

```sh
npm ci --cache "$HOME/.npm-ideabank-cache"
```

For a first-time download, run `git clone https://github.com/Brown0245/ideabank.git` and then `cd ideabank` before installing.

## Set up AI meal lookup

AI lookup uses the OpenAI API from a small server running on your computer. It requires your own OpenAI API key with API billing enabled; a ChatGPT subscription does not include API credit. The starter dishes still work without a key.

1. Create an API key in your [OpenAI API account](https://platform.openai.com/api-keys).
2. In the project folder, copy the server settings example:

   ```sh
   cp .env.server.example .env.server
   ```

3. Open `.env.server` in your editor and enter your key after `AI_API_KEY=`. Save the file. Keep the key in this local file; do not paste it into chat or commit it to GitHub.
4. Start the AI server:

   ```sh
   npm run server
   ```

Leave this Terminal window open. The server reads `.env.server`, which is ignored by Git. Restart the server if you change its settings. It uses `gpt-4.1-mini` by default; `AI_MODEL` can select another compatible model. An existing `OPENAI_API_KEY` server environment variable is also supported when `AI_API_KEY` is absent.

The API key stays on the server. Never put it in an `EXPO_PUBLIC_` variable: those values are included in the browser and mobile app.

## Open the web app

With the AI server still running, open a second Terminal window and run:

```sh
cd ~/ideabank
npm run web
```

Expo opens your browser; press **w** in the Expo terminal if it does not. Search for a meal and press **Generate grocery list**. The browser app connects to the AI server on the same computer at port 3001. Both terminal windows must stay open while you use AI lookup.

For a built website served by the same server, stop the development processes and run:

```sh
npm run build:web
npm run server
```

Then open `http://localhost:3001` in your browser. The server serves the generated `dist/` website and the AI API together. Publishing a public website requires hosting the server as well as the app; publishing the development environment does not publish a website.

## Open the mobile app

Install the matching **Expo Go** app on your phone. Your phone and computer must be on the same trusted Wi-Fi network.

The phone needs your computer's local network IP address to reach the AI server. Copy `.env.example` to `.env.local`, then replace the example address with your computer's address:

```sh
cp .env.example .env.local
```

In `.env.server`, set `API_HOST=0.0.0.0` so the AI server accepts connections from your local network. Restart it with `npm run server`. In a second Terminal window, run:

```sh
npm start
```

Scan Expo's QR code with Expo Go on Android or Camera on iPhone. Restart Expo after editing `.env.local`. `EXPO_PUBLIC_API_URL` is the server's address, not an API key.

The server is intended for local development and has no user authentication. Only expose it on a trusted network; public deployment needs authentication and appropriate access controls. A remote cloud computer's localhost address cannot be reached by your phone. `npm run android` requires an Android emulator, and `npm run ios` requires macOS and Xcode.

## Development checks

```sh
npm test
npx expo export --platform android --platform ios --platform web
```

Automated AI tests use a stubbed provider response and do not spend API credit. A successful live AI request still requires a working API key and network access. Native device testing is required before release.

Starter recipes live in `recipes.js`. The server handles `POST /api/recipes` with a meal name and returns a dish name and ingredient list; `GET /api/health` reports whether a server-side key is configured without revealing it.
