# Watch Party

Watch films with friends in other countries, each on **your own** streaming
subscription, in sync.

Friend A is in the US with Netflix and Hulu. Friend B is in the UK with Prime
Video and NOW. Watch Party finds the films **both** can stream on a
subscription plan in their own country, then keeps both players in step. It
never touches video: each person streams directly from their own account. The
app only discovers titles and coordinates play, pause and seek.

```
watch-party/
├── packages/shared   Protocol, service registry, catalog intersection, sync math,
│                     the injected <video> controller, and the room client
├── apps/server       Catalog API + Socket.io sync server (Node, Express, Redis)
├── apps/mobile       iOS/Android app (Expo, expo-router, react-native-webview)
└── apps/extension    Desktop browser extension (Chrome Manifest V3)
```

## Quick start

Requires Node 22 and npm 10. Redis and ffmpeg are optional for local work.

```bash
cd watch-party
npm install
npm run dev:server          # http://localhost:8080, fixture catalog, in-memory store
```

With no API keys the server uses a **fixture catalog**. Its titles are real,
but which service carries them where is made up. The server logs a warning,
and the API reports `provider: "fixture"`.

**Try sync in a browser.** Generate the test video once, then open the
harness in two windows:

```bash
npm run media -w @watch-party/server     # needs ffmpeg
# open http://localhost:8080/dev/ and use "open another member"
```

The harness runs the production injected controller and room client against
a real `<video>`.

**Mobile.** `react-native-webview` ships in Expo Go, so no custom build is
needed to try the app:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8080 npx expo start
```

On a phone, `localhost` is the phone itself, so use your computer's LAN
address.

**Extension.**

```bash
npm run build -w @watch-party/extension        # or build:dev to also match localhost
```

Load `apps/extension/build` from `chrome://extensions` with "Load unpacked".
Set your server URL under Settings in the popup.

## Configuration

All server settings are environment variables, validated at start-up. See
[`apps/server/.env.example`](apps/server/.env.example) for the full list.

| Variable                         | Purpose                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                 | HMAC key for session tokens. Required in production.                                    |
| `REDIS_URL`                      | Catalog cache, room state, multi-instance broadcasts.                                   |
| `STREAMING_AVAILABILITY_API_KEY` | Primary catalog source (RapidAPI, or direct with `STREAMING_AVAILABILITY_MODE=direct`). |
| `TMDB_READ_TOKEN`                | Alternative catalog source. Also fills in posters, runtime and overviews.               |
| `CATALOG_TTL_HOURS`              | Regional catalog cache lifetime. Default 18, inside the spec's 12–24h.                  |
| `CATALOG_MAX_PAGES`              | Page budget per regional catalog, which caps API cost.                                  |

In production the server refuses to start without a session secret and a
real catalog source. `ALLOW_FIXTURE_CATALOG=1` overrides the second for demos.

## How it works

### 1. Catalog intersection

For each person, the server unions the catalogs of their services in their
country. It then intersects those unions across everyone in the room:

```
Common = ⋂ over people ( ⋃ over their services  Catalog(country, service, subscription) )
```

Each regional catalog is cached in Redis as a sorted set of TMDB ids scored
by popularity, with a hash of deep links beside it. The intersection runs as
Redis `ZUNIONSTORE` and `ZINTERSTORE`, so full catalogs never leave Redis.

- **Subscription only.** Streaming Availability is queried with
  `catalogs=<service>.subscription`, and results are filtered again to
  `type === "subscription"`. TMDB is queried with
  `with_watch_monetization_types=flatrate`. Rent and buy never count.
- **TMDB ids are the universal key** across providers.
- **TMDB provider ids are resolved by name at runtime.** TMDB re-keys
  providers after rebrands, such as HBO Max becoming Max. Resolving by name
  means a stale id can't silently empty a catalog.
- **Caching.** Lifetimes get ±10% jitter so catalogs don't all expire
  together. Concurrent requests share one fetch, across instances too, via a
  Redis lock. If a refresh fails, the last good catalog keeps being served.
- **Reference implementation.** `intersectCatalogs()` in the shared package
  is the executable spec. Tests check that the Redis path returns exactly the
  same result.

### 2. The player controller

`packages/shared/src/player/controller.ts` is bundled into a 9.6 KB script.
The mobile app injects it into the streaming page, and the extension runs it
as a content script. It differs from the spec's sample controller on purpose:

| Spec sample                       | This implementation                                                                                                                          | Why                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finds the `<video>` once at load. | A MutationObserver and periodic rescans follow the largest visible video, including inside shadow roots.                                     | Streaming sites build the player later and replace it for trailers, ads and next episode.                                                          |
| Sets `isRemoteAction` for 300 ms. | Each remote action registers the state it expects to cause, with a 4 s deadline. Only media events matching that expectation are suppressed. | Slow seeks fire `seeked` after 300 ms and would echo back in a loop. A real user action during the window doesn't match, so it still gets through. |
| Seeks at 0.5 s drift.             | Seeks at 1.0 s while playing and 0.25 s while paused. Below that it nudges `playbackRate` to 1.05 or 0.95, with hysteresis.                  | Matches the spec's sync rules and avoids audio jumps.                                                                                              |
| Writes `video.currentTime`.       | A Netflix adapter seeks through Netflix's own player API.                                                                                    | Writing `currentTime` on Netflix ends in the M7375 error screen.                                                                                   |
| `video.play()` result ignored.    | Reports autoplay blocks. The user's next tap rejoins the room's position instead of broadcasting a stale one.                                | Mobile autoplay policies.                                                                                                                          |

The controller only ever touches `<video>` elements. It never reads inputs,
forms, cookies or storage, so service passwords stay invisible to it.

### 3. Real-time sync

Socket.io carries the spec's events. `JOIN_ROOM` and `SYNC_ACTION` keep the
spec's payloads. Additions are `HOST_HEARTBEAT`, `MEMBER_STATUS`,
`SELECT_TITLE`, `SCHEDULE_START`, `TRANSFER_HOST`, `UPDATE_SETTINGS` and
`TIME_PING`. See [`packages/shared/src/protocol.ts`](packages/shared/src/protocol.ts).

- **Identity.** Devices get an anonymous signed session token. The server
  takes the sender from the token and overwrites any `senderId` in the
  payload, so nobody can act as the host by editing JSON.
- **Clock sync.** Each client estimates its offset from the server clock,
  NTP-style. It uses the median of the lowest-round-trip samples. Timestamps
  are in server time, so a pause sent at 1243.52 s lands on the same frame on
  every continent.
- **Host primacy.** Only the host's heartbeats, sent every 2 s, drive drift
  correction. If the host disconnects, they keep the role for a grace period
  of 20 s by default, because phones drop connections when backgrounded.
  After that the longest-standing member takes over. Rooms also prune stale
  offline members on every update, in case a server instance dies along with
  its timers.
- **Late joiners** catch up to the room's projected position.
- **Host-only control** is optional. A guest's local action then snaps them
  back instead of being broadcast.
- **Synchronised countdown.** Everyone parks on the same frame, then presses
  play together at a scheduled server time.

### 4. When a service won't play in a WebView

Netflix refuses mobile web playback outright, and other services vary by
device and DRM. The mobile app handles this in three ways:

- It starts in **native mode** for services marked unsupported.
- It switches when the page reports a media error, which is how DRM refusals
  usually surface.
- It always offers "Watch in the app" in the player menu.

Native mode deep-links into the service's app. It uses universal links, or
`nflx://` for Netflix titles. Sync then becomes manual: a live room clock
shows where to scrub to, and the host can run a countdown.

## Engineering constraints from the spec

1. **No video handling.** Nothing captures frames, relays stream URLs or
   proxies media. Only small JSON control messages cross the server.
2. **Deep links as fallback.** See section 4 above.
3. **Credentials stay in the WebView.** The WebView cookie jar isn't shared
   with Safari. Session tokens for this app live in the iOS Keychain or
   Android Keystore via `expo-secure-store`. Navigation is limited to the
   chosen service's own domains, plus its sign-in domains such as Apple ID.

## Testing

```bash
npm run lint && npm run format:check && npm run typecheck
TEST_REDIS_URL=redis://localhost:6379 npm test   # Redis is optional; those suites skip without it
npm run test:e2e                                 # server e2e: real Chromium, real video
npm run test:e2e -w @watch-party/extension       # loads the built extension into Chromium
```

| Suite         | Covers                                                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared        | Intersection, sync math and clock sync. The controller runs against a simulated `<video>` with slow events, covering echo suppression, drift, autoplay blocks and Netflix seeks.                                                                                                                     |
| server        | The Redis store and in-memory store pass the same contract. Catalog caching, stale-on-error and filters. Provider parsing against mocked HTTP. The full Socket.io protocol: auth, spoofing, rate limits, host lifecycle and selection. Two server instances sharing Redis.                           |
| server e2e    | Two Chromium tabs, each a separate session. Play, pause and seek from either side. Exact counts prove there are no echo storms. Drift is corrected by a 1.05 nudge, with an emulated slow media clock. Hard seeks past 1 s. Late joiners, host hand-off and the countdown. Runs against both stores. |
| extension e2e | The real built extension syncs a plain video page with a harness member, and the popup shows the room.                                                                                                                                                                                               |
| mobile        | Navigation allowlist, mode choice, profile validation and formatting. CI also runs `expo-doctor` and bundles Android and iOS with Metro.                                                                                                                                                             |

CI is defined in `.github/workflows/watch-party-ci.yml`.

## Deployment

```bash
SESSION_SECRET=$(openssl rand -hex 32) TMDB_READ_TOKEN=... docker compose up --build
```

The server is stateless apart from Redis, so you can run several instances.
Clients connect over WebSocket only, so load balancers need no sticky
sessions. Broadcasts fan out through the Socket.io Redis adapter. Set
`TRUST_PROXY=1` behind a reverse proxy.

## Not verified here

- **Real streaming services.** No streaming accounts were available, so the
  controller was exercised against real `<video>` elements, not Netflix,
  Prime Video and the rest. The Netflix player API is undocumented and can
  change without notice.
- **DRM on devices.** Playback inside WebViews wasn't tested on phones. It
  depends on the device's Widevine level, iOS version and each service's
  policy, which is why the native fallback exists.
- **Mobile UI on a device.** The app typechecks, passes `expo-doctor` and
  bundles for both platforms. It hasn't been run on a device or simulator.
- **The Docker image** is built and health-checked only in CI. This
  environment had no Docker daemon. The Dockerfile's steps were replayed by
  hand here.
- **Terms of service.** Some services' terms restrict scripting their web
  players. Similar watch-party extensions exist, but check each service's
  terms before shipping.

## Placeholders to change before release

- The bundle id `com.covertcloak.watchparty` in `apps/mobile/app.json`.
- The extension icon, which is generated procedurally by
  `apps/extension/scripts/icons.mjs`.

## Attribution

With TMDB as the source, availability data comes from JustWatch via TMDB.
The app shows the provider's attribution string from `GET /api/meta`. This
product uses the TMDB API but is not endorsed or certified by TMDB.
