# Contribution guidelines

- Keep the TypeScript code in `server.ts` heavily commented so new contributors can easily follow the logic.
- Before committing **always** run:
  - `npm install`
  - `npx tsc -p tsconfig.json`
  - `npm start`
  Verify that the server starts without errors, then stop it.
- Place new mock files under `mocks/` and only edit `config/config.yml` if you need a default variant other than `0.ts`.
- Update the `README.md` whenever you introduce new features or configuration options.
