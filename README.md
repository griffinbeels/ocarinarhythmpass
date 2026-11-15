# Ocarina Rhythm Pass

A small playable prototype of one design idea.

**Play it in your browser:** https://griffinbeels.github.io/ocarinarhythmpass/

## The idea

In some games you play a short song to make something happen. After you play the song, the game plays the same notes back to you before anything happens. You wait, even when you played the song well.

A Rhythm Pass changes that. When you play the song in rhythm, the game does not repeat it. The song just continues.

This prototype lets you feel both versions on one song, and it shows how long each one takes.

## How to try it

1. Stand on the glowing plate and press **E** to take out the ocarina.
2. Play the Tide Song: **↓ → ↑ ↓ → ↑**. The rhythm is short, short, long, twice. Press "Hear it" to listen first.
3. Play it in rhythm to earn a Rhythm Pass. Play it fast and out of rhythm to hear the game repeat it.
4. Click **Original** in the panel, then play the song again. Compare the two times under "Time per song".

## Keys

| Key | What it does |
|---|---|
| W A S D | Move |
| E | Take the ocarina out, or put it away. While the game plays the song, E skips the rest of it. |
| Esc | Put the ocarina away. |
| Arrow keys, Space | Play notes. Hold a key to hold the note. |
| 1, 2 | Choose a preset: Original, or Rhythm Pass Prototype |

## Settings

The two presets at the top of the panel only set the switches below them. You can change any switch yourself.

| Setting | What it does |
|---|---|
| Rhythm Pass | A song played in rhythm is not repeated. |
| Timing popups | Shows how early or late each note started, in frames. |
| Note colors | Colors each note green, yellow or red as you play it. |
| Note length bars | Draws notes as bars on a moving time line. |
| Accompaniment | A lyre joins in while you keep the rhythm. |
| Early skip | Lets E skip the part of the song that the game repeats. |

"Tuning" holds the numbers behind the rhythm rule, such as how early or late a note can start.

## Run it on your computer

You need [Node.js](https://nodejs.org/). There is nothing else to install.

- On Windows, open `Start Prototype.bat`.
- On any system, run `node serve.mjs` and open http://localhost:5200/.

To run the tests for the rhythm rule: `node --test tests/song.test.mjs`

## How it is built

- `index.html` and `style.css`: the page, the options panel and the note chart.
- `src/song.js`: the song and the rhythm rule. It has no browser code, so the tests can load it.
- `src/main.js`: the game. It reads the keys, judges the rhythm, plays the song back and draws the chart.
- `src/world.js`: the 3D room and the figure.
- `src/audio.js`: every sound, made in the browser. There are no sound files.

## Notes

- The idea is about the ocarina songs in The Legend of Zelda: Ocarina of Time 3D. The length of the wait before the repeat, and the order of what the chart does, were measured from that game.
- Everything you see and hear was made for this prototype: the song, the room, the figure and the sounds. It uses no art, music or code from any game.
- I built this with Claude as a coding tool. The design and the tuning choices are mine.
- The 3D drawing uses [three.js](https://threejs.org/) under the MIT license. The license is in `vendor/three-LICENSE.txt`.
