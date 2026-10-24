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

## The pocket radio (for other sites)

A small receiver any site can carry, as Pixel City does. It plays the same broadcast, folds away to a pill, and links to the station. Add these after the page's own scripts:

```html
<script src="https://dvexperiments.github.io/PixelFM/universe.js"></script>
<script src="https://dvexperiments.github.io/PixelFM/js/audio.js"></script>
<script src="https://dvexperiments.github.io/PixelFM/js/voice.js"></script>
<script src="https://dvexperiments.github.io/PixelFM/js/widget.js"></script>
```

When the listener first tunes in, the widget loads any sources the host page lacks (Glacial, Weather, Senate, City, Bookmaker, Daily Pixel), so the presenters say the same words on every site. Whether it's folded is remembered across the universe; it starts folded on phones.

**Moving between pages.** Listening is remembered for the browser tab. When a listener goes from the city to the station, or back, the radio starts again on the new page if the browser allows it; if not, the button reads "Tap to keep listening". Browsers stop audio when a page changes, so there's a brief gap either way.

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
js/app.js       the display and the LED equalizer
js/voice.js     the presenters' voices, shared with the widget
js/widget.js    the pocket radio for other sites
css/style.css   Glacial's variables, so Senate laws restyle the station
```

## Song crazes

From 1 December 2026 Pixel FM reads Pixel City Society (City's `society.js`). When a song has caught on around the city, it is requested: at most once an hour, straight after the news, more often the further the craze has spread, so it climbs the chart. The request uses its own seed, so the rest of each hour is drawn as before. Pages that load Pixel FM must also load the chain the Senate needs (see the Senate's README); the widget loads it itself.
