from importlib import resources

from pyhocon import ConfigFactory
from pydantic import BaseModel, parse_obj_as


class AppConf(BaseModel):
    project_id: str

    @staticmethod
    def _default_conf_file() -> str:
        return "app.conf"

    @staticmethod
    def resource_package() -> str:
        return "resources"

    @classmethod
    def load(cls) -> "AppConf":
        configuration = resources.read_text(
            cls.resource_package(), cls._default_conf_file()
        )
        as_hocon = ConfigFactory.parse_string(configuration)
        return parse_obj_as(cls, as_hocon)
