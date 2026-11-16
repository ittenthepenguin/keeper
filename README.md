# Keeper

Keeper’s company landing page, terminal Menu, and connected browser prototype for Georgia Tech CS4803 Group 6.

Hosted address: https://keeper-itten-gt2026.tinypivot1.chatgpt.site/

## Navigation

- `/` — company landing page and pilot contact
- `/menu/` — animated terminal navigation, team profiles, and account-preview panel
- `/demo/` — current desktop prototype
- `/phone` — phone companion
- `/dashcam` — camera/recording companion
- `/s/<token>` — a scoped recipient link created inside the demo

All application links use the same origin. The pilot email opens a draft to ioh38@gatech.edu. Account sign-in remains a clearly labeled preview, with a working link into the demo workspace.

## Prototype behavior

Camera capture, uploads, playback, scoped recipient links, revocation, and ZIP downloads are connected. The hosted adapter stores each browser session separately in a private R2 binding. A recipient can access only the record covered by their shared token; revoking that token disables subsequent hosted reads. Reset clears that browser session’s records and uploaded media. Browser cookies identify the demo session; this is not production account authentication or a paired physical-device implementation.

Acquisition signing, proof generation, remote backup, and retention enforcement remain simulated. Exported acquisition records explicitly say they are unsigned. This site does not demonstrate qualified BeagleBone capture or an on-device proof.

## Source and build

The company page and Menu come from the team’s existing implementation; the React demo derives from the team’s Figma-exported source. `site/` contains the public-facing export only. The private course repository, discovery transcripts, and PDFs are not part of this release.

Node 22 or newer is sufficient to build and test this release; no npm install is needed:

```sh
npm test
npm run build
```

The build embeds the static assets and the Worker adapter in `dist/server/index.js`. `.openai/hosting.json` identifies the Site and its `BUCKET` R2 binding. Publishing uses the Sites source/version/deployment workflow. No runtime secrets are stored in this repository.

## Team

- [Itten Oh](https://github.com/ittenthepenguin)
- [Jacob Rippe](https://github.com/raakka)
- [Nihal Kabir](https://github.com/nihalkabir)

Font licenses are retained alongside the exported fonts.
