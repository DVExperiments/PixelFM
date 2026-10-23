# Pixel FM, 88.8

The radio station of the Pixel Universe: generated music, generated presenters, on air around the clock. Follows the [Pixel Universe Shared Conventions](../Pixel_Universe_Shared_Conventions.md).

## Same for everyone

The broadcast is a pure function of time. Each hour's running order is fixed by its date, each song is composed from its seed, and each script is written from the universe at the moment it airs. Two people who tune in at the same moment hear the same song at the same point. Only the presenters' voices differ, because they use each browser's own speech voices.

On air from **19 October 2026**. Nothing upstream is required: the music and schedule depend on time alone, and the presenters simply skip any site that isn't loaded.

## The music

Every song is composed in `universe.js` and synthesised in `js/audio.js`; nothing is sampled.

- **Genres:** chip pop (112–126 bpm), lo-fi crawl (72–84, swung, with vinyl crackle), synthwave (94–106), Dither funk (100–110) and Glacier ambient (64–72, no drums).
- **Composition:** a key and mode; verse, chorus and bridge chord progressions; a two-bar melodic motif and its answer, re-anchored on each chord, with strong beats landing on chord tones; genre drum patterns with fills and crashes; bass lines and chord parts by genre.
- **Form:** intro, verse, chorus, verse, chorus, (bridge, chorus), outro. Songs run about 1½ to 3 minutes.
- **Catalogue:** a 40-song launch library, then 12 new songs every Monday at 00:00 UTC. The rotation draws on the last six weeks, favours new releases and never repeats a song within an hour.
- **Artists:** the sixteen Glacial pixels and twenty city bands.

## The running order

Each hour: the news on the hour, then songs separated by presenter links, idents and in-universe adverts, ending with a time check or, if there's room, the chart rundown.

| Show | UTC | Presenter |
| --- | --- | --- |
| The Morning Crawl | 18:00–22:00 | Lux Halftone |
| Midday Drift | 22:00–04:00 | Pica Strobe |
| The Afternoon Lag | 04:00–10:00 | Ochre Vance |
| Dim Mode | 10:00–18:00 | Umber Nightly |

Scripts read Glacial (live positions, naps and sprints), the Weather Bureau (conditions and Isobar's forecast), the Bookmaker (the favourite), Pixel City (air, demand, blackouts), the Senate and City's latest big events, and the Daily Pixel's headlines. Requests come from the Bookmaker's regulars.

## API (`window.PixelUniverse.radio`)

| Member | Returns |
| --- | --- |
| `stateAt(t)` | What's on, the show, coming up, recently played, the chart, this week's releases |
| `eventsBetween(from, to)` | `station.on_air`, `releases.new` and `chart.number_one` (weekly, Mondays) |
| `itemAt(t)`, `itemsBetween(from, to)`, `hour(h)` | The running order |
| `songMeta(id)`, `compose(id)` | A song's details, and its full score as `[beat, length, instrument, note, velocity]` |
| `script(item)` | The words for a talk item |
| `chart(t, n)` | The top n by plays in the seven days before t |

The Daily Pixel and the Museum can load this file to report the chart. Nothing else is needed.

## Repo layout

```
index.html      the receiver
universe.js     composer, schedule and scripts, no DOM
js/audio.js     the synthesiser and scheduler
js/app.js       the display, the LED equalizer and the voices
css/style.css   Glacial's variables, so Senate laws restyle the station
```
