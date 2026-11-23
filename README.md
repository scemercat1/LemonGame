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

**Goal**
1. Go to the doghouse and tap the food to grab a portion.
2. Tap the plate – the dog comes over and eats.
3. Pet the dog (it barks) and the cat (it meows and purrs).
4. Scare off the crows that try to steal the food.
5. Collect the lemons lying on the grass.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page, UI text, styles, on-screen arrows, boot loader with diagnostics |
| `vendor/three.module.min.js` | Three.js r160 (MIT, see `vendor/THREE-LICENSE.txt`), served from the same site |
| `game.js` | The whole game: endless world, 3D animals, crows, sounds, controls |
| `assets/dog-face.jpg`, `assets/dog-coat.jpg` | Dog face and coat, cropped from the original photo |
| `assets/cat-face.jpg`, `assets/cat-coat.jpg` | Cat face and coat, cropped from the original photo |
| `assets/*-cutout-reference.jpg` | Full cropped animal photos (reference) |

Sounds are generated in the browser with the Web Audio API, so there are no external audio files.

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
3. Pick the branch with the game (for example `main`, or `claude/jolly-maxwell-szh7bq`) and the `/ (root)` folder.
4. After a few minutes the game is at `https://<user>.github.io/LemonGame/`.

All paths are relative (`./game.js`, `./assets/...`), so it also works from a subfolder.
