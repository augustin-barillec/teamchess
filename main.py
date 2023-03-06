from random import randint

import flask
from flask import Flask, jsonify
from flask_pydantic import validate
from google.cloud.firestore import Client, CollectionReference

from models.configuration import FlaskConf, GcpConf
from models.moves import MovesPayload

gcp_conf = GcpConf.load()
flask_conf = FlaskConf.load()

app = Flask(__name__)
project_id = gcp_conf.project_id
db = Client(project=project_id)
db_coll_path = gcp_conf.firestore_path
app.secret_key = flask_conf.secret_key.get_secret_value()


@app.route("/moves/<game_id>", methods=["POST"])
@validate()
def get_moves(game_id: str, body: MovesPayload):
    """Receive next moves chosen by player in the given game"""
    document = db.collection(gcp_conf.top_collection).document(gcp_conf.app_document)  # created via tf
    game_coll: CollectionReference = document.collection(game_id)  # creates it if not exists
    moves = game_coll.document("moves").get()  # retrieved past moves
    if moves.exists:
        # not the first move of the game
        return jsonify({"first": False})
    else:
        # first move of the game
        return jsonify({"first": True})


if __name__ == "__main__":
    app.run(debug=True, port=5100)
