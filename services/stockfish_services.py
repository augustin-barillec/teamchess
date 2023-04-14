from stockfish import Stockfish

from models.configuration import StockfishConf
from models.moves import ChessMove, EvalPlayerMove, MoveEval, PlayerMove


class StockfishServices:
    def __init__(self) -> None:
        self.stock_conf = StockfishConf.load()
        self.stockfish = Stockfish(
            path=self.stock_conf.path,
            depth=self.stock_conf.depth,
            parameters={"Threads": self.stock_conf.threads, "Minimum Thinking Time": self.stock_conf.min_thinking_time},
        )

    def _set_position(self, position: list[ChessMove]) -> None:
        "Set position. List of moves must be valid"
        self.stockfish.set_position(position)

    def get_top_moves(self, nb: int) -> list[MoveEval]:
        return [MoveEval(**move_eval) for move_eval in self.stockfish.get_top_moves(nb)]

    def order_players_moves(self, position: list[ChessMove], players_moves: list[PlayerMove]) -> list[EvalPlayerMove]:
        "Returned evalued player moves ordered from top move to bad move"
        # need descending order evals if white to play, ascending if black to play
        white_to_play: bool = len(position) % 2 == 0
        self._set_position(position=position)
        top_moves = self.get_top_moves(self.stock_conf.nb_best_moves)
        ordered_moves: list[EvalPlayerMove] = list()
        for player_move in players_moves:
            ordered_moves.append(
                EvalPlayerMove(
                    player_id=player_move.player_id,
                    evaluation=next(
                        (evalu for evalu in top_moves if evalu.move == player_move.move),
                        MoveEval(
                            move=player_move.move, centipawn=-99999 if white_to_play else 99999, mate_in=None
                        ),  # handle too bad move not retrieved in top_moves
                    ),
                )
            )
        ordered_moves.sort(key=lambda eval_mov: eval_mov.evaluation.centipawn, reverse=white_to_play)
        return ordered_moves


sf = StockfishServices()

eval_moves = sf.order_players_moves(
    position=["a2a4"],
    players_moves=[
        PlayerMove(**{"player_id": "toto", "move": "e7e5"}),
        PlayerMove(**{"player_id": "titi", "move": "d7d5"}),
        PlayerMove(**{"player_id": "tata", "move": "c7c5"}),
    ],
)

print(eval_moves)
