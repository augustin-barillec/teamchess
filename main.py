import flask

app = flask.Flask(__name__)

app.secret_key = 'asdsdfsdfs13sdf_df%&'


@app.route('/')
def home():
    logged = False
    if 'name' in flask.session:
        logged = True
    return flask.render_template('home.html', logged=logged)


@app.route('/login', methods=['GET', 'POST'])
def login():
    if flask.request.method == 'POST':
        flask.session['name'] = flask.request.form['name']
        return flask.redirect('/')
    return flask.redirect('/')


@app.route('/logout')
def logout():
    flask.session.pop('name', None)
    return flask.redirect('/')


@app.route('/start')
def start():
    import random
    x = random.randint(1, 100)
    return flask.redirect(f'/game_{x}')


@app.route('/join', methods=['GET', 'POST'])
def join():
    if flask.request.method == 'POST':
        game_id = flask.request.form['game']
        return flask.redirect(f'/game_{game_id}')
    return flask.redirect('/')


@app.route('/game_<game_id>')
def game(game_id):
    print(game_id)
    return flask.render_template('game.html', game_id=game_id)


if __name__ == "__main__":
    app.run(debug=True, port=5100)
