from app import constants


def get_existing_user(db, session):
    if 'user_id' not in session:
        return
    user_id = session['user_id']
    user_ref = db.collection(constants.USERS).document(user_id)
    if not user_ref.get().exist:
        return
    return user_ref


def get_existing_user_and_game(db, session):
    user_ref = get_existing_user(db, session)
    if user_ref is None:
        return
    user_dict = user_ref.get().to_dict()
    if 'game_id' not in user_dict:
        return
    game_id = user_dict['game_id']
    game_ref = db.collection(constants.GAMES).document(game_id)
    if not game_ref.get().exist:
        return
    return user_ref, game_ref




    # user_dict = user_ref.get().to_dict()
    # if 'game_id' not in user_dict:
    #     return False
    # game_id = user_dict['game_id']
    # game_ref = db.collection(constants.GAMES).document(game_id)
    # if not game_ref.get().exists:
    #     return False
    # return user_
    #
    #
    #
    # if not user_ref.get().exists:
    #     return flask.redirect('/')

