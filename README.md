# 🍋 Lemon Garden

A 3D spring game in an endless garden with dogs, cats, crows and lemons.
Written with Three.js and no build step, so it runs directly on GitHub Pages.

## How to play

**On a computer**
- `W A S D` – move
- `Space` – jump · `Shift` – sprint
- `Left click` – pet the animals, grab food from the doghouse, put food on the plate
- `Drag with the mouse` – rotate the camera · `Mouse wheel` – zoom

**On a phone**
- On-screen arrows – move (only shown on phones)
- ⤒ in the middle of the arrows – jump
- `Tap` an animal, the food house or the plate – your lemon walks over and acts
- `Drag with your finger` – rotate the camera

**What you can do**
- Get Capi food at **Capi Food** (or the doghouse) and June food at **June Food**; tap a plate to serve it.
- Pet Capi (dog) and June (cat) to raise their friendship; press **F** / **Call** and friends follow you.
- Take your pets to a **vet** every 3 days, or when they get sick (random event). Vets are rare and only beyond the river, each one farther away than the last.
- Bring them to a **pet park**: they play there and gain friendship.
- The **Chest Shop** starts abandoned. Bring 7 lemons and tap **Renovate**: June (in a work outfit) and two lemon builders rebuild it in 35 seconds, with scaffolding, a mini crane and a work in progress sign. Then open its chest for torches and place them on the ground to light the night.
- Collect lemons; select one and tap the screen (or press **E**) to eat it and fill the hunger bar.
- Find **forests** and pick **blueberries** (max 6 in the inventory). Serve them on Capi's or June's plate: their next vet check-up moves one day later.
- Buy a **name tag** at the Chest Shop (🍋 × 5) to give Capi or June a name of your own.
- Run a **lemonade stand**: it starts abandoned; repairing it costs 10 coins. June and the lemon builders rebuild it step by step in about 2:30: they clear the old stand, build the frame, put up the umbrella, paint the sign and add the final touches (a lemon crate, a cash box, a menu board and two stools), while one builder hammers and the other carries planks from the material pile. Then make lemonade (🍋 × 2) or blueberry lemonade (🍋 × 2 + 🫐), and lemon visitors buy it for coins 🪙 during the day.
- Spend coins at the **Lemon Market**: collars, party hats and scarves for your pets, garden decorations (flower pots, lanterns that glow at night, benches, fences) and a **fishing rod**. Sell your fish there too.
- Complete 3 **daily missions** 📋 for coins.
- **Seasons** change every 4 days: spring flowers, summer star showers, an autumn fair (lemonade sells for more) and winter snow with a Christmas tree and a frozen river you can skate on.
- **Fish** in the river with the rod (not in winter): fish feed your pets, golden fish sell for 20 🪙.
- Open the **map** (🗺, minimap or **M**), tap a spot to set a waypoint and walk there.
- The **☰ menu** (top right) holds the camera, rain, sound and help buttons, and lets you hide the minimap, the stats panel, hunger and stamina, or the Tasks and Call buttons. Tap the 🍋 title to fold the top-left panel. These choices are remembered on this device.
- The garden looks more alive: grass and flowers sway in the wind (stronger in the rain), the ground has patches and bare spots, pollen floats in the sunlight, and the lemon kicks up dust when it lands after a jump.
- Bring the old **cable car** about 50 m south of home back to life. It works like a real detachable gondola:
  - **Old base** (🪙 30 to renovate): a rusty, half collapsed station behind a broken fence with **DO NOT TOUCH**, **NO TRESPASSING** and **RENOVATE · 30 🪙** signs. You cannot get in: touching the invisible wall around it asks you to renovate. June and the lemon builders renovate it in about 1:30, with a tower crane.
  - **Old line:** two rusty towers still stand with a sagging cable and broken cabins hanging from it, the other towers have fallen, and one cabin lies in the grass.
  - **Generator** (🪙 30): powers the drive. Tap it to turn it on or off. It hums quietly and puffs a little smoke while it runs.
  - **South Port line** (🪙 10 to renovate, after the base): about 300 m along the river. The old line is taken down, the new towers go up one by one, then the haul rope is pulled, the South Port station is built and the 5 cabins are hung (about 1:30).
  - **Riding:** with the generator on, the 5 cabins go round non stop. They slow down in the stations, go round the bullwheel, speed up to 6 m/s on the line and click over the tower wheels.
  - **Tickets:** buy them at the **🎟 ticket shop** near home, next to the cable car signpost: 🪙 3 for one ride, or 🪙 6 for two (there and back, so you do not get stuck at South Port; there is no ticket shop at the port). With a ticket, tap a cable car station: the lemon walks round to the platform and steps into the next cabin. Pets that follow you ride along for free.
  - **South Port** is a fishing harbour with a quay, a pier and boats. While you are within 30 m of it, the fishermen put 1 fish a minute in its crate (up to 12; sometimes a golden fish). Tap the crate to take them.
  - **North Port** is locked for now (coming soon).
  - Vets and pet parks never overlap the cable car or the ports: saved ones that do are moved to a free spot when the game loads. Forests keep out of the line's corridor.
- Sleep in the tent at night, sprint with stamina, watch the rain and the day/night cycle.
- Follow the stone path from the tent past Capi's house to the river and cross it on the bridge (or wade through, slower). Capi and June sometimes go to the river to drink. Listen to the water, the frogs at night and watch the fireflies.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page, UI text, styles, on-screen arrows, boot loader with diagnostics |
| `vendor/three.module.min.js` | Three.js r160 (MIT, see `vendor/THREE-LICENSE.txt`), served from the same site |
| `game.js` | The whole game: endless world, 3D animals, crows, sounds, controls, save data and badges |
| `myday.js` | My Day account link: sign in, session refresh, Firestore save/load and badges (REST) |
| `assets/dog-face.jpg`, `assets/dog-coat.jpg` | Dog face and coat, cropped from the original photo |
| `assets/cat-face.jpg`, `assets/cat-coat.jpg` | Cat face and coat, cropped from the original photo |
| `assets/*-cutout-reference.jpg` | Full cropped animal photos (reference) |

Sounds are generated in the browser with the Web Audio API, so there are no external audio files.

## Save progress with My Day

The game works without an account. Signing in with a My Day account adds cloud saves and badges.

- **Save progress with My Day** (in the top-left panel) opens the sign in form: username and password of a My Day account.
- **Create account** opens a sign up form: display name (public, up to 20 characters), username (hidden, 3–20 lowercase letters, numbers or _) and password (at least 6 characters, typed twice). The account works in the game and in the My Day extension. It creates the Firebase Auth user `username@myday.app` and the profile `profiles/{uid}` with `name`; the profile is written only at sign up, never for an existing account.
- On sign in, the save in `gameSaves/{uid}` is loaded. If there is none, the current progress is saved there.
- Progress is saved with **Save now** and automatically every 2 minutes while signed in. The session stays after a reload until **Sign out**, which only ends the game's session.
- Firestore documents written by the game:
  - `profiles/{uid}`: `name` (display name), only when an account is created in the game
  - `gameSaves/{uid}`: `data` (JSON string of the game state) and `savedAt` (timestamp)
  - `gameProfiles/{uid}`: `lemon_1`, `lemon_2`, `lemon_secret` (`true` once earned, never reset) and `updatedAt`
- Badges (earned while signed in):
  - 🍋 **If you have lemons, make lemonade!** (Common): collect your first lemon
  - 🐾 **Pet me** (Rare): pet an animal
  - 🌟 **The Real Truth** (Legendary, secret): reach day 15. Shown as "???" until earned.

## Supported browsers

Only **Safari** and **Chrome** are supported. Other browsers show a notice.

## Run locally

Any static server works, for example:

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000`. Three.js is included in `vendor/`, so no CDN is needed.

## Troubleshooting

If the game cannot start, a panel shows the boot step where it stopped, the error, browser and WebGL
info and network checks. Tap **Copy report** and share it. Add `?debug=1` to the URL to see the boot log live.

## Publish on GitHub Pages

1. On GitHub, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the `main` branch and the `/ (root)` folder.
4. After a few minutes the game is at `https://<user>.github.io/LemonGame/`.

All paths are relative (`./game.js`, `./assets/...`), so it also works from a subfolder.
