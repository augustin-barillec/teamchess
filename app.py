import os
from flask import Flask, jsonify, session, redirect, request
from flask_cors import CORS
import google.cloud.firestore
from dotenv import load_dotenv
from random import randint
import reusable

load_dotenv()

GAMES = "games_a"
USERS = "users_a"

# configuration
DEBUG = True

# connect to DB
project_id = os.getenv("PROJECT_ID")
db = google.cloud.firestore.Client(project=project_id)

# instantiate the app
app = Flask(__name__)
app.config.from_object(__name__)

# enable CORS
CORS(app, resources={r"/*": {"origins": "*"}})


# sanity check route
@app.route("/ping", methods=["GET"])
def ping_pong():
    # get all dicts in collection
    items_ref = db.collection(USERS)
    # return json with all dicts
    return jsonify({item.id: item.to_dict() for item in items_ref.stream()})


@app.route("/get_player", methods=["GET"])
def get_player():
    if "user_id" not in session:
        user_dict = {"player_name": f"a{randint(1, 100)}", "game_id": None}
        user_ref = db.collection(USERS).add(user_dict)
        session["user_id"] = user_ref.id
    else:
        user_dict = (
            db.collection(USERS).document(session["user_id"]).get().to_dict()
        )
    player_name = user_dict["player_name"]
    game_id = user_dict["game_id"]
    game_not_found = (
        game_id is not None
        and not db.collection(GAMES).document(game_id).get().exists
    )
    game_id = "" if game_id is None else game_id
    return jsonify(player_name, game_id, game_not_found)


@app.route("/update_player_name", methods=["POST"])
def update_player_name():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    player_name = request.form["player_name"]
    user_ref.update({"player_name": player_name})
    return redirect("/")


@app.route("/create", methods=["POST"])
def create():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    game_dict = {
        "moves": [],
        "players": {},
        "organizer": user_ref.id,
        "has_started": False,
    }
    game_ref = db.collection(GAMES).add(game_dict)
    user_ref.update({"game_id": game_ref.id})
    return redirect("/game")


@app.route("/join", methods=["POST"])
def join():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    game_id = request.form["game_id"]
    user_ref.update({"game_id": game_id})
    if not db.collection(GAMES).document(game_id).get().exists:
        return redirect("/")
    return redirect("/game")


@app.route("/join_team_white", methods=["POST"])
def join_team_white():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    user_dict = user_ref.get().to_dict()
    game_id = user_dict["game_id"]
    if not db.collection(GAMES).document(game_id).get().exists:
        return redirect("/")
    game_ref = db.collection(GAMES).document(game_id)
    now = reusable.time.get_now()
    game_ref.update({f"players.{user_ref.id}": (now, "team_white")})
    return redirect("/game")


@app.route("/join_team_black", methods=["POST"])
def join_team_black():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    user_dict = user_ref.get().to_dict()
    game_id = user_dict["game_id"]
    if not db.collection(GAMES).document(game_id).get().exists:
        return redirect("/")
    game_ref = db.collection(GAMES).document(game_id)
    now = reusable.time.get_now()
    game_ref.update({f"players.{user_ref.id}": (now, "team_black")})
    return redirect("/game")


@app.route("/quit_team", methods=["POST"])
def quit_team():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    user_dict = user_ref.get().to_dict()
    game_id = user_dict["game_id"]
    game_ref = db.collection(GAMES).document(game_id)
    if not game_ref.get().exists:
        return redirect("/")
    game_ref.update(
        {f"players.{user_ref.id}": google.cloud.firestore.DELETE_FIELD}
    )
    return redirect("/game")


@app.route("/start", methods=["POST"])
def start():
    if "user_id" not in session:
        return redirect("/")
    user_ref = db.collection(USERS).document(session["user_id"])
    user_dict = user_ref.get().to_dict()
    game_id = user_dict["game_id"]
    game_ref = db.collection(GAMES).document(game_id)
    if not game_ref.get().exists:
        return redirect("/")
    game_ref.update({"has_started": True})
    return redirect("/game")


@app.route("/game", methods=["GET"])
def game():
    if "user_id" not in session:
        return redirect("/")
    user_id = session["user_id"]
    user_ref = db.collection(USERS).document(user_id)
    user_dict = user_ref.get().to_dict()
    game_id = user_dict["game_id"]
    if not db.collection(GAMES).document(game_id).get().exists:
        return redirect("/")
    game_ref = db.collection(GAMES).document(game_id)
    game_dict = game_ref.get().to_dict()
    is_organizer = game_dict["organizer"] == user_id
    has_started = game_dict["has_started"]
    players = game_dict["players"]
    has_joined_players = user_id in players
    sorted_players = sorted(players, key=lambda p: players[p][0])

    team_white_player_names = []
    team_black_player_names = []
    for user_id in sorted_players:
        if db.collection(USERS).document(user_id).get().exists:
            user_dict = db.collection(USERS).document(user_id).get().to_dict()
            player_name = user_dict["player_name"]
            team = players[user_id][1]
            if team == "team_white":
                team_white_player_names.append(player_name)
            elif team == "team_black":
                team_black_player_names.append(player_name)

    display_join_team_buttons = not has_started and not has_joined_players

    display_quit_team_button = not has_started and has_joined_players

    display_start_button = (
        not has_started
        and is_organizer
        and len(team_white_player_names) > 0
        and len(team_black_player_names) > 0
    )

    return jsonify(
        {
            game_id,
            # team_white_player_names,
            # team_black_player_names,
            has_started,
            display_join_team_buttons,
            display_quit_team_button,
            display_start_button,
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5100)