# 🍋 Lemon Garden

A 3D spring game in an endless garden with dogs, cats, crows and lemons.
Written with Three.js and no build step, so it runs directly on GitHub Pages.

## How to play

**On a computer**
- `W A S D` – move
- `Left click` – pet the animals, grab food from the doghouse, put food on the plate
- `Drag with the mouse` – rotate the camera · `Mouse wheel` – zoom

**On a phone**
- On-screen arrows – move (only shown on phones)
- `Tap` an animal, the food house or the plate – your lemon walks over and acts
- `Drag with your finger` – rotate the camera

**What you can do**
- Get Capi food at **Capi Food** (or the doghouse) and June food at **June Food**; tap a plate to serve it.
- Pet Capi (dog) and June (cat) to raise their friendship; press **F** / **Call** and friends follow you.
- Take your pets to a **vet** every 3 days, or when they get sick (random event).
- Bring them to a **pet park**: they play there and gain friendship.
- Open the **Chest Shop** chest for torches; place them on the ground to light the night.
- Collect lemons; select one and tap the screen (or press **E**) to eat it and fill the hunger bar.
- Open the **map** (🗺, minimap or **M**), tap a spot to set a waypoint and walk there.
- Sleep in the tent at night, sprint with stamina, watch the rain and the day/night cycle.

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

- **Save progress with My Day** (in the top-left panel) opens the sign in form: username and password of a My Day account. **Create account** opens https://myday.projectlemon.net/ in a new tab.
- On sign in, the save in `gameSaves/{uid}` is loaded. If there is none, the current progress is saved there.
- Progress is saved with **Save now** and automatically every 2 minutes while signed in. The session stays after a reload until **Sign out**, which only ends the game's session.
- Firestore documents written by the game:
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
