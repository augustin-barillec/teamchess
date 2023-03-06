from stockfish import Stockfish

from models.configuration import StockfishConf
from models.moves import ChessMoves, MoveEval


class StockfishServices:
    def __init__(self) -> None:
        stock_conf = StockfishConf.load()
        self.stockfish = Stockfish(
            path=stock_conf.path,
            depth=stock_conf.depth,
            parameters={"Threads": stock_conf.threads, "Minimum Thinking Time": stock_conf.min_thinking_time},
        )

    def _set_position(self, moves: ChessMoves) -> None:
        self.stockfish.set_position(moves.list_moves)

    def get_top_moves(self, nb: int) -> list[MoveEval]:
        return [MoveEval(**move_eval) for move_eval in self.stockfish.get_top_moves(nb)]


sf = StockfishServices()

sf._set_position(ChessMoves(list_moves=["a2a4", "e7e5"]))

top_moves = sf.get_top_moves(10)

print(top_moves)
