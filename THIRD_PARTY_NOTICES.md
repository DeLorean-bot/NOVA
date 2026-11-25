# Third-party notices

- **Adblock Plus core 0.7.0**, eyeo GmbH and contributors. Unmodified runtime source in `vendor/adblockpluscore`. GPL-3.0-only; full license in `LICENSE` and `vendor/adblockpluscore/COPYING`. Original project: https://gitlab.com/eyeo/adblockplus/abc/adblockpluscore . Its browser integration in this app is in `electron/adblock.cjs` and `electron/main.cjs`. The combined application is supplied under GPL-3.0-only; third-party notices and original licenses remain applicable.
- **EasyList / EasyPrivacy**, their authors and contributors. Filter headers retain attribution and the license reference https://easylist.to/pages/licence.html . Download sources are recorded in `electron/adblock.cjs`.
- **RU AdList**, Akuma, Lain_13, dimisa and contributors. Attribution and CC-BY 3.0 notice are retained in `filters/ruadlist.txt`; source https://github.com/easylist/ruadlist . Its include files were combined without changing filter rules.
- **Geologica**, The Geologica Project Authors. SIL Open Font License 1.1; `licenses/Geologica-OFL.txt`. Packaged locally with `@fontsource-variable/geologica`.
- **Material Symbols Rounded**, Google. Apache 2.0; `licenses/Material-Symbols-Apache-2.0.txt`. The user's variable font was subset to 37 used glyphs and converted to WOFF2; weight 300..600, optical size 20, grade 0 and fill 0..1. Original source: https://github.com/google/material-design-icons .
- **Stageshow**, OpenAI and contributors. MIT; `licenses/Stageshow-MIT.txt` and `licenses/Stageshow-NOTICE.md`. Kit source remains in `src/kit`; the example adaptation is `src/SourceDemo.tsx`.
- **Unslop**, Damir Sokolovsky, https://x.com/heydamir , https://github.com/heydamir/unslop . CC BY 4.0. Its design rules were applied to this interface; its published design guidance informed the interface.
- **React / React DOM**, Meta Platforms, Inc. and affiliates. MIT; `licenses/React-MIT.txt` and installed package licenses.
- **NOVA logo artwork**, supplied by the project owner. The mark is extracted from the reference and a monochrome variant is used for each theme.
- **Electron**, OpenJS Foundation and contributors. Electron and Chromium notices are included in the packaged runtime.
- **nspell**, Titus Wormer, MIT, and **dictionary-ru**, Russian Hunspell dictionary from LibreOffice, BSD-3-Clause. The packaged dependencies include their original licenses. Used for spelling alternatives in plot search.

Unmodified dependency licenses remain in the respective packages. The source archive includes the application source, copied ABP runtime source, filter snapshots and build configuration.


- Rotten Tomatoes tomato mark: `src/assets/rotten-tomatoes.svg`, https://commons.wikimedia.org/wiki/File:Rotten_Tomatoes.svg (simple logo artwork; trademark belongs to its owner). IMDb and Кинопоиск names/marks identify the respective rating sources. No affiliation is implied.
- Wikidata, https://www.wikidata.org/ , CC0 structured data. Used for the upcoming premiere calendar, exact IMDb-to-RT mapping and dated Tomatometer fallback; the interface identifies Wikidata and the statement date. IMDb ratings and trailers come from the existing title metadata source. RT page scorecards are used when available; ratings are linked to their respective title pages.


- **Liquid Glass 0.0.2**, Glass-HQ, https://github.com/Glass-HQ/liquid-glass . MIT; licenses/Liquid-Glass-MIT.txt. Used in the desktop interface for optical glass surfaces. It does not composite the separate native video surface. Base UI, @lisse/core and vgpu licenses remain in their installed packages.
