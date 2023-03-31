import chess
import flask
from chess import svg
from dotenv import load_dotenv
import os

load_dotenv()

class Game:
    def __init__(self, db, game_id):
        self.db = db
        self.id = game_id

        self.ref = self.db.collection(os.environ["GAMES"]).document(self.id)
        self.dict = self.ref.get().to_dict()

        self.organizer_id = self.dict["organizer_id"]
        self.moves = self.dict["moves"]
        self.players = self.dict["players"]

        self.has_started = len(self.moves) > 0

        self.sorted_players = sorted(
            self.players, key=lambda p: self.players[p][1]
        )

        self.team_white_user_ids = self.get_team_white_user_ids()
        self.team_black_user_ids = self.get_team_black_user_ids()

        self.team_white_user_names = [
            self.get_user_name(user_id) for user_id in self.team_white_user_ids
        ]

        self.team_black_user_names = [
            self.get_user_name(user_id) for user_id in self.team_black_user_ids
        ]

        self.move_numbers = sorted(int(m) for m in self.moves)

        self.current_move_number = self.get_current_move_number()

        played_moves = [
            self.select_best_proposition(self.moves[str(m)])
            for m in self.move_numbers[: self.current_move_number]
        ]
        self.played_moves = [chess.Move.from_uci(m) for m in played_moves]

        self.board = chess.Board()
        for m in self.played_moves:
            self.board.push(m)

        legal_moves = list(self.board.legal_moves)
        self.legal_moves = sorted([str(m) for m in legal_moves])

        self.white_orientation = svg.board(
            board=self.board, orientation=chess.WHITE, size=400
        )
        self.black_orientation = svg.board(
            board=self.board, orientation=chess.BLACK, size=400
        )

    def is_organizer(self, user_id):
        return user_id == self.organizer_id

    def is_player(self, user_id):
        return user_id in self.players

    def get_team_user_ids(self, team_name):
        assert team_name in ("team_white", "team_black")
        res = []
        for user_id in self.sorted_players:
            team_, ts = self.players[user_id]
            if team_ == team_name:
                res.append(user_id)
        return res

    def get_team_white_user_ids(self):
        return self.get_team_user_ids("team_white")

    def get_team_black_user_ids(self):
        return self.get_team_user_ids("team_black")

    def get_user_name(self, user_id):
        return (
            self.db.collection(os.environ["USERS"])
            .document(user_id)
            .get()
            .to_dict()["user_name"]
        )

    def get_team_name(self, user_id):
        if not self.is_player(user_id):
            return None
        return self.players[user_id][0]

    def can_play(self, user_id):
        team_name = self.get_team_name(user_id)
        return (
            team_name
            == self.move_number_to_team_name(self.current_move_number)
            and self.has_started
        )

    @staticmethod
    def move_number_to_team_name(move_number):
        if move_number % 2 == 0:
            return "team_white"
        return "team_black"

    def is_move_completed(self, move_number, move):
        team_name = self.move_number_to_team_name(move_number)
        move_players = sorted(move)
        team_players = getattr(self, f"{team_name}_user_ids")
        return move_players == team_players

    def get_current_move_number(self):
        for move_number_str in self.moves:
            move = self.moves[move_number_str]
            move_number = int(move_number_str)
            if not self.is_move_completed(move_number, move):
                return move_number
        return len(self.moves)

    @staticmethod
    def select_best_proposition(propositions):
        proposers = sorted(propositions)
        best_move = propositions[proposers[0]]
        for user_id in proposers:
            move = propositions[user_id]
            if move[1] > best_move[1]:
                best_move = move
        return best_move[0]

    def compute_board_image(self, user_id):
        team_name = self.get_team_name(user_id)
        board_image = None
        if team_name == "team_white":
            board_image = flask.Markup(self.white_orientation)
        elif team_name == "team_black":
            board_image = flask.Markup(self.black_orientation)
        return board_image

    def get_display(self, user_id):
        display_join_team_buttons = (
            not self.has_started and not self.is_player(user_id)
        )
        display_quit_team_button = not self.has_started and self.is_player(
            user_id
        )
        display_start_button = (
            not self.has_started
            and self.is_organizer(user_id)
            and len(self.team_white_user_ids) > 0
            and len(self.team_black_user_ids) > 0
        )
        display_board_image = self.has_started
        display_submit_move_button = self.can_play(user_id)
        return {
            "display_join_team_buttons": display_join_team_buttons,
            "display_quit_team_button": display_quit_team_button,
            "display_start_button": display_start_button,
            "display_board_image": display_board_image,
            "display_submit_move_button": display_submit_move_button,
        }
