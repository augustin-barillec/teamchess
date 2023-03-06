import re
from typing import Any, ClassVar, Optional, Pattern

from pydantic import BaseModel, Field


class ChessMove(str):
    """
    Pydantic field representing a chess move
    """

    _pattern: ClassVar[str] = r"^[a-h][1-8][a-h][1-8]"
    _compiled: ClassVar[Pattern] = re.compile(_pattern)

    @classmethod
    def __get_validators__(cls):
        yield cls.validate_regex

    @classmethod
    def __modify_schema__(cls, field_schema: dict[str, Any]):
        field_schema.update(
            title="Chess Move: start position to destination position",
            type="string",
            format="move",
            pattern=cls._pattern,
            example="a2a4",
        )

    @classmethod
    def validate_regex(cls, move: str):
        if not cls._compiled.fullmatch(move):
            raise ValueError(f"Invalid Chess Move: '{move!r}', must match pattern: {cls._pattern}")
        return cls(move)

    def __repr__(self):
        return f"ChessMove({super().__repr__()})"


class PlayerMove(BaseModel):
    player_id: str
    move: ChessMove


class MovesPayload(BaseModel):
    moves: list[PlayerMove]


class ChessMoves(BaseModel):
    list_moves: list[ChessMove]


class MoveEval(BaseModel):
    move: ChessMove = Field(alias="Move")
    centipawn: int = Field(alias="Centipawn")
    mate_in: Optional[int] = Field(alias="Mate")

    class Config:
        allow_population_by_field_name = True
