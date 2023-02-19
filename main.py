import os
import flask
import google.cloud.firestore
import reusable

logger = reusable.root_logger.configure_root_logger()
app = flask.Flask(__name__)
# project_id = os.getenv('PROJECT_ID')
# db = google.cloud.firestore.Client(project=project_id)


@app.route('/', methods=['GET', 'POST'])
def home():
    if flask.request.method == 'POST':
        value = flask.request.form['value']
        return flask.redirect(f'/game_{value}')
    return flask.render_template('home.html')


@app.route('/start')
def start():
    import random
    x = random.randint(1, 100)
    print(x)
    return flask.redirect(f'/game_{x}')


@app.route('/game_<game_id>')
def game(game_id):
    print(game_id)
    return flask.render_template('game.html')


if __name__ == "__main__":
    app.run(debug=True, port=5100)
