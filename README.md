# Knights of the Sky — Browser Remake

A fan-made, from-scratch browser remake inspired by **MicroProse's _Knights of the Sky_** (1990 DOS, 1991 Amiga). It is WWI air combat over the trenches of the Western Front: flat-shaded 3D polygons, a period cockpit, gun jams, archie, observation balloons, and a career mode in which you chase the Red Baron and the other German aces for the title of "Ace of Aces".

> **Status: playable alpha.** Career, Quick Dogfight and Training Flight all work end to end. Balance and polish are ongoing.

## Play online

**▶ [robertorenz.github.io/KOTS](https://robertorenz.github.io/KOTS/)**. Every push to `main` deploys automatically through GitHub Actions (`.github/workflows/deploy.yml`).

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
```

It needs a modern desktop browser with WebGL2. It uses Three.js and Vite. All sound is synthesised in the browser, so there are no asset downloads.

## Features

- **Flight model.** Lift, drag, stalls and energy bleed in hard turns. Every aircraft type has its own mass, speed, climb and roll rate.
- **Aircraft from 1916 to 1918:**
  - Allied: Nieuport 17, Sopwith Pup, Triplane, Camel, Dolphin, SPAD VII and XIII, S.E.5a, Bristol F.2b, R.E.8
  - German: Albatros D.II, D.III and D.V, Pfalz D.IIIa, Fokker Dr.I, D.VII and D.VIII, DFW C.V, Halberstadt CL.II
- **The Western Front.** Trenches, no-man's land with shell craters, ruined towns near the lines, rivers, roads, forests and aerodromes. The front line moves with history (the 1918 Spring Offensive, the Hundred Days) and with your results.
- **Enemy aces.** Sixteen historical German aces, each with their own paint scheme and skill. Their victory tallies grow through the war, and they can fall in combat, to you or to history.
- **Missions:**
  - Patrol
  - Balloon busting
  - Escort of a reconnaissance two-seater
  - Ground attack with bombs and strafing
  - Intercept
  - Ace hunt
- **Career.** Play as a British, French or American pilot, with promotions, medals, confirmed victories, capture behind the lines, and the Armistice.
- **Quick Dogfight and Training Flight** modes.
- **Controls.** Keyboard, plus gamepad support.

## Controls

| Action | Keys |
|---|---|
| Pitch (joystick style) | `W`/`S` or `↑`/`↓` |
| Roll | `A`/`D` or `←`/`→` |
| Rudder | `Q`/`E` |
| Throttle | `+`/`-`, `1`–`9`, `0` = full |
| Fire | `Space` |
| Clear gun jam | `J` (tap) |
| Drop bomb | `B` |
| Cycle view / padlock / look back | `V` / `F` / hold `R` |
| Map / pause / time compression | `M` / `P` / `T` |
| Pause menu, end flight | `Esc` |
| Help (controls) | `H` |
| Gamepad | Left stick: fly. Right stick: rudder. A or RT: fire. X: clear jam. Y: view. D-pad: throttle |

## How to play

- **Career.** Enlist a British, French or American pilot. Pick an aircraft in the squadron office, read the briefing and take off. Complete the objective, then get back over the trenches to the west and land at an aerodrome, or press `Esc` → *End flight*. Coming down on the German side means capture.
- **Landing.** Throttle back and glide in at roughly 1.3× stall speed. Touch down gently, with the wings level and a sink rate below about 4.5 m/s.
- **Gunnery.** Get close, under 200 m. The guns jam if you hold the trigger too long; tap `J` to clear them.
- **Realism.** Options can switch on unlimited ammo, no jams, invulnerability, easy flight and easy landings. Each one reduces your career score multiplier.

## Project layout

| File | Purpose |
|---|---|
| `src/flight.js` | Flight model: lift and drag, stall, auto-trim, ground handling |
| `src/world.js` | Terrain, front line, trenches, towns, aerodromes, clouds, map rendering |
| `src/models.js` | Procedural low-poly aircraft, balloons and structures |
| `src/entities.js` | Aircraft, balloons, ground targets, AA guns, damage model |
| `src/ai.js` | AI pilots: pursuit with lead, evasion, formation, routes |
| `src/weapons.js` | Bullets, tracers and bombs |
| `src/mission.js` | Mission generation and objectives |
| `src/campaign.js` | Career, aces, promotions, medals and the moving front |
| `src/hud.js` | Cockpit instrument panel, gunsight, map overlay |
| `src/ui.js` | Menus, briefing, debriefing and modal dialogs |
| `src/main.js` | Game loop, cameras and flight flow |

## About the original game

_Knights of the Sky_ was a World War I combat flight simulator developed and published by **MicroProse Software**. Jeff Briggs designed it.

- **DOS (1990).** The original release.
- **Amiga (1991).** MicroProse's UK division rewrote it from the ground up. Amiga Power gave it 87%, then 92% for the 1993 budget re-release, and ranked it No. 10 in its 1996 all-time Top 100.
- **Atari ST (1991–92).** ST Format scored it 91% in issue #34.
- **Re-release (2015).** Tommo acquired the rights and republished it digitally under its Retroism label.

**Working title.** It was developed as _Red Baron_ and renamed after Dynamix announced its own game with that name.

**Contents.** The box promised 20 flyable aircraft, "every major fighter in World War I." The modes were Flight Training, Dogfight Encounter against any of 16 German aces, a full WWI Campaign, and Head-to-Head over modem or null-modem cable, with a chat mode on `TAB`.

**Campaign.** It began on 1 May 1916, with the player as a British or French pilot. You competed with the German aces, Richthofen, Immelmann and Boelcke among them, to be named the top ace. News and rumours tracked their scores as they improved through the war.

**Missions** included balloon busting, escorting reconnaissance planes and bombers, patrols, and strafing or bombing ground targets such as supply trains. Being shot down behind enemy lines meant capture.

**Patches.** Two later revisions added a more realistic damage model and Allied AI patrols. MicroProse sent them free to any player who mailed in a blank floppy disk.

**Reception.** _Computer Gaming World_ called it "a must for WWI fans and flight simulation fans", and in 1991 named it the most realistic WWI simulation available.

## Credits

### Original game: _Knights of the Sky_ © 1990 MicroProse Software, Inc.

- **Design:** Jeffery L. "Jeff" Briggs
- **Graphics:** Steven Cain
- **Amiga version:** MicroProse UK
- **Atari ST version** (per Atarimania):
  - Programming: Kevin Buckner, Andrew Parton, Mark Langerak
  - Graphics: Allan Holloway, Steven Cain
  - Music: Andrew Parton

The full DOS and Amiga credit lists could not be verified for this README. If you know them, please open an issue with a source.

### This remake

- An independent, non-commercial fan project. It contains **no original code, graphics, sound or data**. All models are procedural, all sound is synthesised, and the aircraft and ace details come from public WWI history.
- Built with [Three.js](https://threejs.org/) (MIT) and [Vite](https://vitejs.dev/) (MIT).
- _Knights of the Sky_ and MicroProse are trademarks of their respective owners. This project is not affiliated with or endorsed by them.

### Sources

- [Wikipedia: Knights of the Sky](https://en.wikipedia.org/wiki/Knights_of_the_Sky)
- [Atarimania: Knights of the Sky (Atari ST)](https://www.atarimania.com/game-atari-st-knights-of-the-sky_9761.html)
- [OldGames.sk: Knights of the Sky](https://oldgames.sk/en/game/knights-of-the-sky)
- [COMPUTE! issue 144 review](https://atarimagazines.com/compute/issue144/A25_Knights_of_the_Sky.php)
- [Contemporary review text (textfiles.com mirror)](https://mirror.cyberbits.eu/textfiles.com/games/REVIEWS/knigtsky.rev)
- [Everygamegoing article](https://everygamegoing.com/larticle/knights-of-the-sky-000/49150)
- [MobyGames entry](https://www.mobygames.com/game/28/)
