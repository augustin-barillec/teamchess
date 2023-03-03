import os
from flask import Flask, jsonify
from flask_cors import CORS
import google.cloud.firestore
from dotenv import load_dotenv

load_dotenv()
USERS = 'users_a'

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
    items_ref = db.collection(USERS)
    return jsonify({item.id: item.to_dict() for item in items_ref.stream()})


if __name__ == "__main__":
    app.run()
