# Contribution guidelines

- Keep TypeScript code in `server.ts` commented generously so new contributors
  can follow the logic.
- Always run the following commands before committing:
  - `npm install`
  - `npx tsc -p tsconfig.json`
  - `npm start`
- Place new mocks under the `mocks/` directory and update `config/config.yml`
  only if a default different from `0.ts` is needed.
