import os
import random
import flask
import flask_socketio
import google.cloud.firestore
import tools
app = flask.Flask(__name__)
project_id = os.environ['PROJECT_ID']
db = google.cloud.firestore.Client(project=project_id)
app.secret_key = 'asdsdfsdfs13sdf_df%&'
socketio = flask_socketio.SocketIO(app)

GAMES = 'ab_games'
USERS = 'ab_users'


@app.route('/')
def home():
    if 'user_id' not in flask.session:
        user_dict = {
            'player_name': f'a{random.randint(1, 100)}',
            'game_id': None}
        update_time, user_ref = db.collection(USERS).add(user_dict)
        flask.session['user_id'] = user_ref.id
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(
        flask.session['user_id'])
    if not user_ref.get().exists:
        flask.session.clear()
        return flask.redirect('/')
    user_dict = user_ref.get().to_dict()
    player_name = user_dict['player_name']
    game_id = user_dict['game_id']
    game_not_found = (
            game_id is not None and
            not db.collection(GAMES).document(game_id).get().exists)
    game_id = '' if game_id is None else game_id
    return flask.render_template(
        'home.html',
        player_name=player_name,
        game_id=game_id,
        game_not_found=game_not_found)


@app.route('/update_player_name', methods=['POST'])
def update_player_name():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    player_name = flask.request.form['player_name']
    user_ref.update({'player_name': player_name})
    return flask.redirect('/')


@app.route('/create', methods=['POST'])
def create():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    game_dict = {
        'moves': [],
        'players': {},
        'organizer': user_ref.id,
        'has_started': False}
    update_time, game_ref = db.collection(GAMES).add(game_dict)
    user_ref.update({'game_id': game_ref.id})
    return flask.redirect('/game')


@app.route('/join', methods=['POST'])
def join():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    game_id = flask.request.form['game_id']
    user_ref.update({'game_id': game_id})
    if not db.collection(GAMES).document(game_id).get().exists:
        return flask.redirect('/')
    return flask.redirect('/game')


@app.route('/join_team_white', methods=['POST'])
def join_team_white():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return flask.redirect('/')
    game_ref = db.collection(GAMES).document(game_id)
    now = tools.time.get_now()
    game_ref.update({f'players.{user_ref.id}': (now, 'team_white')})
    return flask.redirect('/game')


@app.route('/join_team_black', methods=['POST'])
def join_team_black():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return flask.redirect('/')
    game_ref = db.collection(GAMES).document(game_id)
    now = tools.time.get_now()
    game_ref.update({f'players.{user_ref.id}': (now, 'team_black')})
    return flask.redirect('/game')


@app.route('/quit_team', methods=['POST'])
def quit_team():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    game_ref = db.collection(GAMES).document(game_id)
    if not game_ref.get().exists:
        return flask.redirect('/')
    game_ref.update(
        {f'players.{user_ref.id}': google.cloud.firestore.DELETE_FIELD})
    return flask.redirect('/game')


@app.route('/start', methods=['POST'])
def start():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    game_ref = db.collection(GAMES).document(game_id)
    if not game_ref.get().exists:
        return flask.redirect('/')
    game_ref.update({'has_started': True})
    return flask.redirect('/game')


@app.route('/game')
def game():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_id = flask.session['user_id']
    user_ref = db.collection(USERS).document(user_id)
    if not user_ref.get().exists:
        return flask.redirect('/')
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return flask.redirect('/')
    game_ref = db.collection(GAMES).document(game_id)
    game_dict = game_ref.get().to_dict()
    is_organizer = game_dict['organizer'] == user_id
    has_started = game_dict['has_started']
    players = game_dict['players']
    has_joined_players = user_id in players
    sorted_players = sorted(players, key=lambda p: players[p][0])

    team_white_player_names = []
    team_black_player_names = []
    for user_id in sorted_players:
        if db.collection(USERS).document(user_id).get().exists:
            user_dict = db.collection(
                USERS).document(user_id).get().to_dict()
            player_name = user_dict['player_name']
            team = players[user_id][1]
            if team == 'team_white':
                team_white_player_names.append(player_name)
            elif team == 'team_black':
                team_black_player_names.append(player_name)

    display_join_team_buttons = (
        not has_started and not has_joined_players)

    display_quit_team_button = (
        not has_started and has_joined_players)

    display_start_button = (
            not has_started and is_organizer and
            len(team_white_player_names) > 0 and
            len(team_black_player_names) > 0)

    return flask.render_template(
        'game.html',
        game_id=game_id,
        team_white_player_names=team_white_player_names,
        team_black_player_names=team_black_player_names,
        has_started=has_started,
        display_join_team_buttons=display_join_team_buttons,
        display_quit_team_button=display_quit_team_button,
        display_start_button=display_start_button)


@socketio.on("message")
def message(data):
    if 'user_id' not in flask.session:
        return
    user_id = flask.session['user_id']
    user_ref = db.collection(USERS).document(user_id)
    if not user_ref.get().exists:
        return
    user_dict = user_ref.get().to_dict()
    player_name = user_dict['player_name']
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return
    content = {"name": player_name, "message": data["data"]}
    flask_socketio.send(content, to=game_id)


@socketio.on("connect")
def connect():
    if 'user_id' not in flask.session:
        return
    user_id = flask.session['user_id']
    user_ref = db.collection(USERS).document(user_id)
    if not user_ref.get().exists:
        return
    user_dict = user_ref.get().to_dict()
    player_name = user_dict['player_name']
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return
    flask_socketio.join_room(game_id)
    flask_socketio.send(
        {"name": player_name, "message": "has entered the room"}, to=game_id)


@socketio.on("disconnect")
def disconnect():
    if 'user_id' not in flask.session:
        return
    user_id = flask.session['user_id']
    user_ref = db.collection(USERS).document(user_id)
    if not user_ref.get().exists:
        return
    user_dict = user_ref.get().to_dict()
    player_name = user_dict['player_name']
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return
    flask_socketio.leave_room(game_id)
    flask_socketio.send(
        {"name": player_name, "message": "has left the room"}, to=game_id)


if __name__ == "__main__":
    socketio.run(app, debug=True)
