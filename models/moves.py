from pydantic import BaseModel


class PlayerMove(BaseModel):
    player_id: str
    move: str


class MovesPayload(BaseModel):
    moves: list[PlayerMove]
