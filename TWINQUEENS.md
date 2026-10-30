# Twin Queens

Twin Queens is a chess server for one variant: a 9×8 board with two queens on each side
(setup RNBQKQNBR). It is built on pychess-variants (https://github.com/pychess/pychess-variants)
and is distributed under the same license, GNU AGPL v3 (see LICENSE). If you run a modified
version as a public site, you must offer its source code to its users.

Base: pychess-variants commit 495b336408eb1090922befb3541addc7cf7d16fd (30 Oct 2026).
Apply the changes with `git apply --binary twinqueens-changes.patch`.

## What was changed compared to pychess-variants

- New variant `twinqueens` (variants.ini, client/variantsIni.ts, server/variants.py, client/variants.ts).
- 9×8 board geometry (`cg-576-512` in static/chessground.css, extensions.css, lobby.css) and
  12 board themes (static/images/board/9x8*.svg|jpg).
- The site offers only Twin Queens (`SITE_VARIANTS` in server/variants.py and client/variants.ts).
- Lobby: a quick-pairing grid 1+0, 3+0, 3+2, 5+0, 5+3, 10+0, 10+5, 15+10, 30+0, 30+20 and Custom
  (client/lobby/layer1.ts, static/layer-1.css).
- Tournament schedule: weekly and monthly Twin Queens arenas and a monthly shield
  (server/tournament/scheduler.py).
- Branding "Twin Queens", reduced menu, 10 interface languages (en, ru, es, pt, de, fr, it, tr, ja, zh_CN).
- Rules page: static/docs/twinqueens.md and twinqueens.ru.md.

## Running locally

Requirements: Python 3.14 (uv), Node 24 (yarn), MongoDB 8.

    uv sync --extra dev
    yarn install
    yarn dev && yarn md
    uv run server/server.py            # http://localhost:8080

Playing against the computer and server-side analysis need a fairyfishnet worker and a
Fairy-Stockfish binary built with large boards and all variants:

    git clone --depth 1 https://github.com/fairy-stockfish/Fairy-Stockfish
    cd Fairy-Stockfish/src && make -j build ARCH=x86-64-modern largeboards=yes all=yes

    FISHNET_KEYS='{"localkey":"local-worker"}' uv run server/server.py
    uvx fairyfishnet --no-conf --key localkey --endpoint http://localhost:8080/fishnet/ \
        --stockfish-command /path/to/stockfish
