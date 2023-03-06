from stockfish import Stockfish

from models.configuration import StockfishConf, GcpConf

gcp_conf = GcpConf.load()

# stock_conf = StockfishConf.load()

# stockfish = Stockfish(
#     path=stock_conf.path,
#     depth=stock_conf.depth,
#     parameters={"Threads": stock_conf.threads, "Minimum Thinking Time": stock_conf.min_thinking_time},
# )
