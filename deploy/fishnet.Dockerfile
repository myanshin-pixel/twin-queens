# Engine worker: plays the computer's moves and analyses games with Fairy-Stockfish.
FROM python:3.12-slim
RUN pip install --no-cache-dir fairyfishnet
WORKDIR /fishnet
CMD ["sh", "-c", "fairyfishnet --no-conf --key \"$FISHNET_KEY\" --endpoint http://server:8080/fishnet/ --cores auto --memory 256"]
