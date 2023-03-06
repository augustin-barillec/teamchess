# General Architecture

- a frontend 
- a backend : python/flask app + firestore

# Roles of each one's

## Frontend

Handle game creation ? create a game, create players, number of players, team repartition, timer ...

## Backend 

Handle chess. A single endpoint (or two if asynchronous). 

The front make a post with such a payload : 
- {"game_id": "xxxxxx", "moves": {"player1": "a2-a4", "player2": "b2-b4", "player3": "c2-c4"}}
And backend returns the best move (or every player move ordered with their eval for front diplay) (or ordered moves with comment like 'blunder', 'awesome' ...), and eventually all the next possible moves (based on the chosen best move) for front display : 
- {"moves": ["a2-a4": "-2.1", "b2-b4": "-1.12", "c2-c4": "-0.14"], "next_legal_moves": ["", "", "", "", "" ...]}

This implies that backend make 

