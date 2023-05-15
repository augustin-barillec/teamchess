import os
import random
import flask
import flask_socketio
import google.cloud.firestore
import tools
import model
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = flask.Flask(__name__)
project_id = os.environ["PROJECT_ID"]
db = google.cloud.firestore.Client(project=project_id)
app.secret_key = "asdsdfsdfs13sdf_df%&"
socketio = flask_socketio.SocketIO(app)

# enable CORS
CORS(app, resources={r"/*": {"origins": "*"}})

project_id = os.getenv("PROJECT_ID")


def user_create():
    user_dict = {"user_name": f"a{random.randint(1, 100)}"}
    update_time, user_ref = db.collection(os.environ["USERS"]).add(user_dict)
    return user_ref.id


@app.after_request
def after_request(response):
    response.headers.add(
        "Access-Control-Allow-Origin", "http://localhost:8080"
    )
    response.headers.add(
        "Access-Control-Allow-Headers", "Content-Type,Authorization"
    )
    response.headers.add(
        "Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS"
    )
    response.headers.add("Access-Control-Allow-Credentials", "true")
    return response


@app.route("/")
def home():
    if "user_id" not in flask.session:
        user_dict = {"user_name": f"a{random.randint(1, 100)}"}
        update_time, user_ref = db.collection(os.environ["USERS"]).add(
            user_dict
        )
        flask.session["user_id"] = user_ref.id
        return flask.redirect("/")
    user_id = flask.session["user_id"]
    user_ref = db.collection(os.environ["USERS"]).document(user_id)
    user_dict = user_ref.get().to_dict()
    if user_dict is None:
        flask.session.clear()
        return flask.redirect("/")
    user_name = user_dict["user_name"]
    game_id = user_dict.get("game_id")
    game_not_found = (
        game_id is not None
        and not db.collection(os.environ["GAMES"])
        .document(game_id)
        .get()
        .exists
    )
    game_id_to_display = "" if game_id is None else game_id
    return flask.render_template(
        "home.html",
        user_name=user_name,
        game_id_to_display=game_id_to_display,
        game_not_found=game_not_found,
    )


@app.route("/update_user_name", methods=["POST"])
def update_user_name():
    data = flask.request.json
    user_ref = db.collection(os.environ["USERS"]).document(data["player_id"])
    user_dict = user_ref.get().to_dict()
    if user_dict is None:
        user_id = user_create()
        user_ref = db.collection(os.environ["USERS"]).document(user_id)
    user_ref.update({"user_name": data["user_name"]})
    user_dict = user_ref.get().to_dict()
    return flask.make_response(
        flask.jsonify({"user": user_dict, "user_id": user_ref.id})
    )


@app.route("/create_user", methods=["GET"])
def create_user():
    user_id = user_create()
    user_ref = db.collection(os.environ["USERS"]).document(user_id)
    user_dict = user_ref.get().to_dict()
    return flask.make_response(
        flask.jsonify({"user": user_dict, "user_id": user_ref.id})
    )


@app.route("/get_user", methods=["POST"])
def get_user():
    data = flask.request.json
    user_ref = db.collection(os.environ["USERS"]).document(data["player_id"])
    user_dict = user_ref.get().to_dict()
    if user_dict is None:
        user_id = user_create()
        user_ref = db.collection(os.environ["USERS"]).document(user_id)
        user_dict = user_ref.get().to_dict()
    return flask.make_response(
        flask.jsonify({"user": user_dict, "user_id": user_ref.id})
    )


@app.route("/create_game", methods=["POST"])
def create_game():
    data = flask.request.json
    user_ref = db.collection(os.environ["USERS"]).document(data["player_id"])
    user_dict = user_ref.get().to_dict()
    if user_dict is None:
        return flask.make_response(flask.jsonify({"error": "User unknown"}))
    game_dict = {"organizer_id": user_ref.id, "moves": {}, "players": {}}
    update_time, game_ref = db.collection(os.environ["GAMES"]).add(game_dict)
    user_ref.update({"game_id": game_ref.id})
    return flask.make_response(flask.jsonify({"game_id": game_ref.id}))


@app.route("/join_game", methods=["POST"])
def join_game():
    user_ref = model.get.get_user(db, flask.session)
    if user_ref is None:
        flask.redirect("/")
    game_id = flask.request.form["game_id"]
    user_ref.update({"game_id": game_id})
    game_ref = db.collection(os.environ["GAMES"]).document(game_id)
    if not game_ref.get().exists:
        return flask.redirect("/")
    return flask.redirect("/game")


@app.route("/delete_game", methods=["POST"])
def delete_game():
    data = flask.request.json
    user_ref = db.collection(os.environ["USERS"]).document(data["player_id"])
    user_ref.update({"game_id": google.cloud.firestore.DELETE_FIELD})
    user_dict = user_ref.get().to_dict()
    if "game_id" not in user_dict:
        return flask.make_response(
            flask.jsonify({"success": "Game successfully deleted"})
        )
    else:
        return flask.make_response(
            flask.jsonify({"error": "Error when deleting game"})
        )


@app.route("/join_team", methods=["POST"])
def join_team():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return flask.redirect("/")
    user_ref, game_ref = user_ref_and_game_ref
    team = list(flask.request.form.keys())[0]
    now = tools.time.get_now()
    game_ref.update({f"players.{user_ref.id}": (team, now)})
    socketio.emit("refresh", to=game_ref.id)
    return flask.redirect("/game")


@app.route("/quit_team", methods=["POST"])
def quit_team():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return flask.redirect("/")
    user_ref, game_ref = user_ref_and_game_ref
    game_ref.update(
        {f"players.{user_ref.id}": google.cloud.firestore.DELETE_FIELD}
    )
    socketio.emit("refresh", to=game_ref.id)
    return flask.redirect("/game")


@app.route("/start_game", methods=["POST"])
def start_game():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return flask.redirect("/")
    user_ref, game_ref = user_ref_and_game_ref
    game_ref.update({"moves.0": {}})
    socketio.emit("refresh", to=game_ref.id)
    return flask.redirect("/game")


@app.route("/submit_move", methods=["POST"])
def submit_move():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return flask.redirect("/")
    user_ref, game_ref = user_ref_and_game_ref
    move_number = list(flask.request.form.keys())[0]
    move = flask.request.form[move_number]
    game_ref.update({f"moves.{move_number}.{user_ref.id}": (move, 3)})
    socketio.emit("refresh", to=game_ref.id)
    return flask.redirect("/game")


@app.route("/game")
def game():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return flask.redirect("/")
    user_ref, game_ref = user_ref_and_game_ref
    game_id = game_ref.id
    g = model.game.Game(db, game_id)
    user_id = user_ref.id
    user_name = g.get_user_name(user_id)
    played_moves = g.played_moves
    current_move_number = g.current_move_number
    team_white_user_names = g.team_white_user_names
    team_black_user_names = g.team_black_user_names
    has_started = g.has_started
    legal_moves = g.legal_moves
    board_image = g.compute_board_image(user_id)
    display = g.get_display(user_id)
    display_join_team_buttons = display["display_join_team_buttons"]
    display_quit_team_button = display["display_quit_team_button"]
    display_start_button = display["display_start_button"]
    display_board_image = display["display_board_image"]
    display_submit_move_button = display["display_submit_move_button"]
    return flask.render_template(
        "game.html",
        user_id=user_id,
        user_name=user_name,
        game_id=game_id,
        played_moves=played_moves,
        current_move_number=current_move_number,
        team_white_user_names=team_white_user_names,
        team_black_user_names=team_black_user_names,
        has_started=has_started,
        legal_moves=legal_moves,
        board_image=board_image,
        display_join_team_buttons=display_join_team_buttons,
        display_quit_team_button=display_quit_team_button,
        display_start_button=display_start_button,
        display_board_image=display_board_image,
        display_submit_move_button=display_submit_move_button,
    )


@socketio.on("connect")
def connect():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return
    user_ref, game_ref = user_ref_and_game_ref
    flask_socketio.join_room(game_ref.id)


@socketio.on("disconnect")
def disconnect():
    user_ref_and_game_ref = model.get.get_user_and_game(db, flask.session)
    if user_ref_and_game_ref is None:
        return
    user_ref, game_ref = user_ref_and_game_ref
    flask_socketio.leave_room(game_ref.id)


if __name__ == "__main__":
    socketio.run(app, debug=True)
