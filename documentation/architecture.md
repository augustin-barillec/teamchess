# General Architecture

- a frontend 
- a backend : python/flask app + firestore

# Roles of each one's

## Frontend

Handle game creation ? create a game, create players, number of players, team repartition, timer ...

## Backend 

Handle chess.A single move endpoints, (with game_id in the route), call by the front when players made their moves : 
- return moves eval ordered + next possible moves, with that query : 
```json
{
    "moves": [
        {
            "player": "duke",
            "made": "c2c5"
        },
        {
            "player": "kong",
            "made": "c2c5"
        },
        {
            "player": "damn",
            "made": "c2c5"
        }
    ]
}
```
and that response
```json
{
    "moves": [
        {
            "player": "duke",
            "eval": 1.12
        },
        {
            "player": "kong",
            "eval": 0.45
        },
        {
            "player": "damn",
            "eval": -2
        }
    ],
    "next_moves": [
        "a2a4",
        "b5c7"
    ]
}
```
That implies that backend makes stockfish works between two calls, with some stockfish id to identify the job, and stop it when next post is made to retrieve evals

Plus eventually a CREATE and A DELETE game endpoints, for clean startup and tear down.


