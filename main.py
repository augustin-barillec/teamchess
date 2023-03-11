import os
import random
import chess
import flask
import flask_socketio
import google.cloud.firestore
import tools
from chess import svg
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


@app.route('/create_game', methods=['POST'])
def create_game():
    if 'user_id' not in flask.session:
        return flask.redirect('/')
    user_ref = db.collection(USERS).document(flask.session['user_id'])
    if not user_ref.get().exists:
        return flask.redirect('/')
    game_dict = {
        'moves': {'0': {}},
        'players': {},
        'organizer': user_ref.id,
        'has_started': False}
    update_time, game_ref = db.collection(GAMES).add(game_dict)
    user_ref.update({'game_id': game_ref.id})
    return flask.redirect('/game')


@app.route('/join_game', methods=['POST'])
def join_game():
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
    socketio.emit('refresh', {}, to=game_id)
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
    socketio.emit('refresh', to=game_id)
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
    socketio.emit('refresh', to=game_id)
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
    socketio.emit('refresh', to=game_id)
    return flask.redirect('/game')


@app.route('/submit_move', methods=['POST'])
def submit_move():
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
    move_number = list(flask.request.form.keys())[0]
    move = flask.request.form[move_number]
    game_ref.update({f'moves.{move_number}.{user_ref.id}': (move, 3)})
    socketio.emit('refresh', to=game_id)
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
    player_name = user_dict['player_name']
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return flask.redirect('/')

    game_ref = db.collection(GAMES).document(game_id)
    game_dict = game_ref.get().to_dict()
    is_organizer = game_dict['organizer'] == user_id
    has_started = game_dict['has_started']

    players = game_dict['players']
    has_joined_players = user_id in players
    team = None
    if has_joined_players:
        team = players[user_id][1]

    sorted_players = sorted(players, key=lambda p: players[p][0])

    team_white_user_ids = []
    team_black_user_ids = []
    team_white_player_names = []
    team_black_player_names = []
    for user_id_ in sorted_players:
        if db.collection(USERS).document(user_id).get().exists:
            user_dict_ = db.collection(
                USERS).document(user_id_).get().to_dict()
            player_name_ = user_dict_['player_name']
            team_ = players[user_id_][1]
            if team_ == 'team_white':
                team_white_player_names.append(player_name_)
                team_white_user_ids.append(user_id_)
            elif team_ == 'team_black':
                team_black_player_names.append(player_name_)
                team_black_user_ids.append(user_id_)
    team_white_user_ids = sorted(team_white_user_ids)
    team_black_user_ids = sorted(team_black_user_ids)

    moves = game_dict['moves']
    move_numbers = sorted(int(m) for m in moves)

    current_move_number = len(moves)
    for m in move_numbers:
        proposers = sorted(moves[str(m)].keys())
        if m % 2 == 0:
            if proposers != team_white_user_ids:
                current_move_number = m
                break
        else:
            if proposers != team_black_user_ids:
                current_move_number = m
                break

    moves_played = [moves[str(m)] for m in move_numbers[:current_move_number]]

    def select_best_move(propositions):
        proposers__ = sorted(propositions)
        best_move = propositions[proposers__[0]]
        for user_id__ in proposers__:
            move = propositions[user_id__]
            if move[1] > best_move[1]:
                best_move = move
        return best_move[0]

    moves_played = [select_best_move(m) for m in moves_played]
    moves_played = [chess.Move.from_uci(m) for m in moves_played]

    board = chess.Board()
    for m in moves_played:
        board.push(m)

    legal_moves = list(board.legal_moves)
    legal_moves = sorted([str(m) for m in legal_moves])

    white_to_play = current_move_number % 2 == 0
    to_play = (team == 'team_white' and white_to_play) or (
            team == 'team_black' and not white_to_play)

    white_orientation = svg.board(
        board=board, orientation=chess.WHITE, size=400)
    black_orientation = svg.board(
        board=board, orientation=chess.BLACK, size=400)
    board_image = None
    if team == 'team_white':
        board_image = flask.Markup(white_orientation)
    elif team == 'team_black':
        board_image = flask.Markup(black_orientation)

    display_join_team_buttons = (
        not has_started and not has_joined_players)

    display_quit_team_button = (
        not has_started and has_joined_players)

    display_start_button = (
            not has_started and is_organizer and
            len(team_white_player_names) > 0 and
            len(team_black_player_names) > 0)

    display_board_image = has_started

    display_submit_move_button = to_play

    return flask.render_template(
        'game.html',
        user_id=user_id,
        player_name=player_name,
        game_id=game_id,
        moves_played=moves_played,
        current_move_number=current_move_number,
        team_white_player_names=team_white_player_names,
        team_black_player_names=team_black_player_names,
        has_started=has_started,
        legal_moves=legal_moves,
        board_image=board_image,
        display_join_team_buttons=display_join_team_buttons,
        display_quit_team_button=display_quit_team_button,
        display_start_button=display_start_button,
        display_board_image=display_board_image,
        display_submit_move_button=display_submit_move_button)


@socketio.on("connect")
def connect():
    if 'user_id' not in flask.session:
        return
    user_id = flask.session['user_id']
    user_ref = db.collection(USERS).document(user_id)
    if not user_ref.get().exists:
        return
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return
    flask_socketio.join_room(game_id)


@socketio.on("disconnect")
def disconnect():
    if 'user_id' not in flask.session:
        return
    user_id = flask.session['user_id']
    user_ref = db.collection(USERS).document(user_id)
    if not user_ref.get().exists:
        return
    user_dict = user_ref.get().to_dict()
    game_id = user_dict['game_id']
    if not db.collection(GAMES).document(game_id).get().exists:
        return
    flask_socketio.leave_room(game_id)


if __name__ == "__main__":
    socketio.run(app, debug=True)
