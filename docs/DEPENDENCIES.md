# Dependencies

Galaxia uses exact dependency versions recorded in `package.json` and `package-lock.json`. This inventory is refreshed from the resolved lockfile after installation.

## Runtime

| Package   | Resolved version | Official project                    |
| --------- | ---------------- | ----------------------------------- |
| React     | 19.2.7           | https://react.dev/                  |
| React DOM | 19.2.7           | https://react.dev/                  |
| PixiJS    | 8.19.0           | https://pixijs.com/                 |
| Zustand   | 5.0.14           | https://zustand.docs.pmnd.rs/       |
| Zod       | 4.4.3            | https://zod.dev/                    |
| Dexie     | 4.4.4            | https://dexie.org/                  |
| fflate    | 0.8.3            | https://github.com/101arrowz/fflate |

## Development

| Package                            | Resolved version | Official project                                              |
| ---------------------------------- | ---------------- | ------------------------------------------------------------- |
| TypeScript                         | 6.0.3            | https://www.typescriptlang.org/                               |
| Vite                               | 8.1.4            | https://vite.dev/                                             |
| Vite React plugin                  | 6.0.3            | https://github.com/vitejs/vite-plugin-react                   |
| Node.js types                      | 26.1.1           | https://github.com/DefinitelyTyped/DefinitelyTyped            |
| React types                        | 19.2.17          | https://github.com/DefinitelyTyped/DefinitelyTyped            |
| React DOM types                    | 19.2.3           | https://github.com/DefinitelyTyped/DefinitelyTyped            |
| Vitest                             | 4.1.10           | https://vitest.dev/                                           |
| Vitest Istanbul coverage           | 4.1.10           | https://vitest.dev/guide/coverage                             |
| Vitest Playwright browser provider | 4.1.10           | https://vitest.dev/guide/browser/                             |
| Playwright Test                    | 1.61.1           | https://playwright.dev/                                       |
| Testing Library React              | 16.3.2           | https://testing-library.com/docs/react-testing-library/intro/ |
| Testing Library jest-dom           | 6.9.1            | https://github.com/testing-library/jest-dom                   |
| ESLint                             | 10.7.0           | https://eslint.org/                                           |
| ESLint JavaScript config           | 10.0.1           | https://eslint.org/                                           |
| TypeScript ESLint                  | 8.64.0           | https://typescript-eslint.io/                                 |
| ESLint React Hooks plugin          | 7.1.1            | https://www.npmjs.com/package/eslint-plugin-react-hooks       |
| ESLint React Refresh plugin        | 0.5.3            | https://github.com/ArnaudBarre/eslint-plugin-react-refresh    |
| Prettier                           | 3.9.5            | https://prettier.io/                                          |
| dependency-cruiser                 | 18.1.0           | https://github.com/sverweij/dependency-cruiser                |
| npm-run-all2                       | 9.0.2            | https://github.com/bcomnes/npm-run-all2                       |
| fake-indexeddb                     | 6.2.5            | https://github.com/dumbmatter/fakeIndexedDB                   |
| Vercel CLI                         | 56.2.0           | https://vercel.com/docs/cli                                   |

The exact transitive dependency graph and integrity hashes are authoritative in `package-lock.json`.
