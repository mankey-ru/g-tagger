# g-tagger
nodejs app for setting ID3 tags and organizing my music collection

## Supported clients
Supported clients, equal priority: Windows Explorer, foobar2000. Spec-correct ID3 semantics come second - some
standard frames are repurposed (e.g. `TPE3` "Conductor" holds the release country) so the data shows up in
Explorer columns. Anything else - Mp3tag, MusicBee, DJ software - may work, but is not tested.

## Written tags
Tags are written as ID3v2.3 via `node-id3`. Data comes from Discogs; artist/title fall back to the file name.

| Data | Frame | Windows Explorer column | foobar2000 field |
|---|---|---|---|
| Title | `TIT2` | Title | `%title%` |
| Artist | `TPE1` | Contributing artists | `%artist%` |
| Album | `TALB` | Album | `%album%` |
| Year | `TYER` | Year | `%date%` |
| Genre / style | `TCON` | Genre | `%genre%` |
| Country | `TPE3` | Conductors | `%conductor%` |
| Country | `TXXX:COUNTRY` | - | `%country%` |
| g-tagger version | `TRSN`, `COMM` | - | `%comment%` (`COMM`) |

Notes:
- Country is written twice: Explorer ignores `TXXX` frames, and ID3v2.3 has no standard country frame. The
  Explorer column "Country/region" is unrelated to mp3 files and always stays empty.
- Explorer columns were checked on Windows 10 by reading Shell properties of a tagged test file. Explorer
  does not display `TXXX`, `TRSN`, `COMM` (as written by `node-id3`), `TIT1`, `TMOO`, `TOPE`, `TPE4`.

## Authentication
- Go to https://www.discogs.com/settings/developers
- Press generate new token
- Copy "Current token" below, paste it into .env_example like this: `DISCOGS_USER_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
- Rename `.env_example` to `.env`
- Enjoy
