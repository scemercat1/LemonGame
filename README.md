# 🍋 Grădina cu Lămâi

Un joc 3D de primăvară, într-o grădină infinită, cu câini, pisici, corbi și lămâi.
Jocul este scris în Three.js, fără build, deci rulează direct pe GitHub Pages.

## Cum se joacă

**Pe calculator**
- `W A S D` – mișcare
- `Click stânga` – mângâie animalele, ia mâncare din cușcă, pune mâncarea pe farfurie
- `Trage cu mouse-ul` – rotește camera · `Rotița mouse-ului` – zoom

**Pe telefon**
- Săgețile de pe ecran – mișcare (apar doar pe telefon)
- `Atinge` un animal, cușca sau farfuria – lămâia merge singură și face acțiunea
- `Trage cu degetul` – rotește camera

**Obiectiv**
1. Mergi la cușca de lângă gard și atinge mâncarea – iei o porție.
2. Atinge farfuria – câinele vine și mănâncă.
3. Mângâie câinele (lătrat) și pisica (miau și ronron).
4. Sperie corbii care vor să fure mâncarea.
5. Strânge lămâile de pe iarbă.

## Fișiere

| Fișier | Rol |
| --- | --- |
| `index.html` | Pagina, interfața în română, stilurile, săgețile pentru telefon |
| `game.js` | Tot jocul: lumea infinită, animalele 3D, corbii, sunetele, controalele |
| `assets/dog-face.jpg`, `assets/dog-coat.jpg` | Fața și blana câinelui, decupate din poza originală |
| `assets/cat-face.jpg`, `assets/cat-coat.jpg` | Fața și blana pisicii, decupate din poza originală |
| `assets/*-cutout-reference.jpg` | Decupajele complete ale animalelor (pentru referință) |

Sunetele sunt generate în browser (Web Audio), deci nu există fișiere audio externe.

## Browsere acceptate

Jocul funcționează doar în **Safari** și **Chrome**. În alte browsere apare un mesaj.

## Rulare locală

Orice server static merge, de exemplu:

```bash
python3 -m http.server 8000
```

apoi deschide `http://localhost:8000`. Este nevoie de conexiune la internet, pentru că Three.js
se încarcă de pe `cdn.jsdelivr.net`.

## Publicare pe GitHub Pages

1. Pe GitHub, mergi la **Settings → Pages**.
2. La **Build and deployment**, alege **Deploy from a branch**.
3. Alege ramura cu jocul (de exemplu `main`, sau `claude/jolly-maxwell-szh7bq`) și folderul `/ (root)`.
4. După câteva minute, jocul este la `https://<utilizator>.github.io/LemonGame/`.

Toate căile sunt relative (`./game.js`, `./assets/...`), deci funcționează și într-un subfolder.
