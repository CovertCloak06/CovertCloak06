/**
 * Offline catalog for development, demos and tests.
 *
 * Titles and TMDB ids are real; WHICH service carries them in WHICH country is
 * NOT. Availability is derived from a stable hash of (title, country,
 * service) so results are deterministic and every service/country mix has
 * some overlap to show. The server refuses this provider in production unless
 * ALLOW_FIXTURE_CATALOG=1, and the API reports `provider: "fixture"`.
 */
import { createHash } from 'node:crypto';
import type { ServiceDefinition } from '@watch-party/shared';
import type { CatalogProvider, ProviderCatalog } from './types.js';

type Row = [tmdbId: number, title: string, year: number, runtime: number, genres: string];

const TITLES: Row[] = [
  [278, 'The Shawshank Redemption', 1994, 142, 'Drama,Crime'],
  [238, 'The Godfather', 1972, 175, 'Drama,Crime'],
  [155, 'The Dark Knight', 2008, 152, 'Action,Crime,Drama'],
  [680, 'Pulp Fiction', 1994, 154, 'Thriller,Crime'],
  [13, 'Forrest Gump', 1994, 142, 'Comedy,Drama,Romance'],
  [550, 'Fight Club', 1999, 139, 'Drama'],
  [603, 'The Matrix', 1999, 136, 'Action,Science Fiction'],
  [27205, 'Inception', 2010, 148, 'Action,Science Fiction,Adventure'],
  [157336, 'Interstellar', 2014, 169, 'Adventure,Drama,Science Fiction'],
  [120, 'The Lord of the Rings: The Fellowship of the Ring', 2001, 179, 'Adventure,Fantasy,Action'],
  [129, 'Spirited Away', 2001, 125, 'Animation,Family,Fantasy'],
  [128, 'Princess Mononoke', 1997, 134, 'Adventure,Fantasy,Animation'],
  [4935, "Howl's Moving Castle", 2004, 119, 'Fantasy,Animation,Adventure'],
  [372058, 'Your Name.', 2016, 106, 'Romance,Animation,Drama'],
  [862, 'Toy Story', 1995, 81, 'Animation,Adventure,Family,Comedy'],
  [12, 'Finding Nemo', 2003, 100, 'Animation,Family'],
  [8587, 'The Lion King', 1994, 89, 'Family,Animation,Drama'],
  [329, 'Jurassic Park', 1993, 127, 'Adventure,Science Fiction'],
  [105, 'Back to the Future', 1985, 116, 'Adventure,Comedy,Science Fiction'],
  [11, 'Star Wars', 1977, 121, 'Adventure,Action,Science Fiction'],
  [1891, 'The Empire Strikes Back', 1980, 124, 'Adventure,Action,Science Fiction'],
  [424, "Schindler's List", 1993, 195, 'Drama,History,War'],
  [497, 'The Green Mile', 1999, 189, 'Fantasy,Drama,Crime'],
  [769, 'GoodFellas', 1990, 145, 'Drama,Crime'],
  [98, 'Gladiator', 2000, 155, 'Action,Drama,Adventure'],
  [274, 'The Silence of the Lambs', 1991, 119, 'Crime,Drama,Thriller'],
  [597, 'Titanic', 1997, 194, 'Drama,Romance'],
  [19995, 'Avatar', 2009, 162, 'Action,Adventure,Fantasy,Science Fiction'],
  [299534, 'Avengers: Endgame', 2019, 181, 'Adventure,Science Fiction,Action'],
  [324857, 'Spider-Man: Into the Spider-Verse', 2018, 117, 'Animation,Action,Adventure'],
  [496243, 'Parasite', 2019, 133, 'Comedy,Thriller,Drama'],
  [438631, 'Dune', 2021, 155, 'Science Fiction,Adventure'],
  [872585, 'Oppenheimer', 2023, 181, 'Drama,History'],
  [346698, 'Barbie', 2023, 114, 'Comedy,Adventure'],
  [545611, 'Everything Everywhere All at Once', 2022, 140, 'Action,Adventure,Science Fiction'],
  [76341, 'Mad Max: Fury Road', 2015, 121, 'Action,Adventure,Science Fiction'],
  [244786, 'Whiplash', 2014, 107, 'Drama,Music'],
  [313369, 'La La Land', 2016, 128, 'Comedy,Drama,Romance,Music'],
  [419430, 'Get Out', 2017, 104, 'Mystery,Thriller,Horror'],
  [120467, 'The Grand Budapest Hotel', 2014, 100, 'Comedy,Drama'],
  [77338, 'The Intouchables', 2011, 113, 'Drama,Comedy'],
  [194, 'Amélie', 2001, 122, 'Comedy,Romance'],
  [670, 'Oldboy', 2003, 120, 'Drama,Thriller,Mystery,Action'],
  [354912, 'Coco', 2017, 105, 'Family,Animation,Fantasy,Music'],
  [150540, 'Inside Out', 2015, 95, 'Animation,Family,Adventure,Drama,Comedy'],
  [10681, 'WALL·E', 2008, 98, 'Animation,Family,Science Fiction'],
  [335984, 'Blade Runner 2049', 2017, 164, 'Science Fiction,Drama'],
  [578, 'Jaws', 1975, 124, 'Horror,Thriller,Adventure'],
];

/** Fraction of titles each (country, service) catalog carries. */
const DENSITY = 0.4;

export function fixtureAvailable(tmdbId: number, country: string, serviceId: string): boolean {
  const digest = createHash('sha256').update(`${tmdbId}:${country}:${serviceId}`).digest();
  return digest.readUInt32BE(0) / 0xffffffff < DENSITY;
}

export class FixtureCatalogProvider implements CatalogProvider {
  readonly id = 'fixture';
  readonly attribution = 'Sample data for development: availability is NOT real';

  async fetchCatalog(country: string, service: ServiceDefinition): Promise<ProviderCatalog> {
    // Popularity is the title's global rank, identical in every catalog.
    const entries = TITLES.map((row, rank) => ({ row, rank }))
      .filter(({ row: [id] }) => fixtureAvailable(id, country, service.id))
      .map(({ row: [tmdbId, title, year, runtime, genres], rank }) => ({
        tmdbId,
        title,
        releaseYear: year,
        popularity: TITLES.length - rank,
        posterUrl: null,
        backdropUrl: null,
        genres: genres.split(','),
        link: null,
        overview: null,
        runtimeMinutes: runtime,
      }));
    return { entries, truncated: false };
  }
}
