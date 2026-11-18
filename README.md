# CH-NEU OrgExplorer

A React and TypeScript application for exploring an organization chart. The
interactive chart supports search, filtering, spreadsheet import, configurable
categories, dotted-line relationships, and printing.

## Data and Power Platform

When running in its configured Power Apps environment, the app reads employee
data from the latest Dataverse snapshot. Category settings and dotted-line
relationships are also stored in Dataverse.

Power Platform environment configuration and provisioning scripts are not
included in this public repository. Configure the app and its Dataverse data
sources for your authorized environment before deploying. Do not commit
credentials, environment-specific configuration, or real employee data.

## Development

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

The local Vite server starts the frontend. Dataverse-backed features require
the appropriate Power Apps environment and data-source configuration.

## Checks

```sh
npm test
npm run build
npm run lint
```
