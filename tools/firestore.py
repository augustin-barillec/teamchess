import datetime
import time
import reusable


def store_player(db, player_id, player_name):
    state_ref = db.collection('players').document(player_id)
    state_ref.set({player_id: player_name}, merge=False)
