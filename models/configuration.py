from importlib import resources
from typing import ClassVar, Type, TypeVar

from pydantic import BaseModel, FilePath, SecretStr, parse_obj_as, validator
from pyhocon import ConfigFactory

T = TypeVar("T", bound="BaseConf")


class BaseConf(BaseModel):
    hocon_path: ClassVar[list[str]] = []

    @staticmethod
    def conf_file() -> str:
        return "app.conf"

    @staticmethod
    def resource_package() -> str:
        return "resources"

    @classmethod
    def load(cls: Type[T]) -> T:
        configuration = resources.read_text(cls.resource_package(), cls.conf_file())
        as_hocon = ConfigFactory.parse_string(configuration)
        for path in cls.hocon_path:
            as_hocon = as_hocon[path]
        return parse_obj_as(cls, as_hocon)


class GcpConf(BaseConf):
    hocon_path: ClassVar[list[str]] = ["gcp"]
    project_id: str
    firestore_path: str

    @validator("firestore_path")
    @classmethod
    def check_teamchess(cls, v: str) -> str:
        if v.startswith("teamchess/") and v.count("/") == 1:
            return v
        else:
            raise ValueError("You must write in teamchess collection and select a document for this app")

    @property
    def top_collection(self) -> str:
        return self.firestore_path.split("/")[0]

    @property
    def app_document(self) -> str:
        return self.firestore_path.split("/")[1]


class FlaskConf(BaseConf):
    hocon_path: ClassVar[list[str]] = ["flask"]
    secret_key: SecretStr


class StockfishConf(BaseConf):
    hocon_path: ClassVar[list[str]] = ["stockfish"]
    path: FilePath
    depth: int
    threads: int
    min_thinking_time: int  # minimum nb of ms to search for a move
