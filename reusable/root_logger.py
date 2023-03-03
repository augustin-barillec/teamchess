import logging


def configure_root_logger(
    level=logging.INFO,
    fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    to_keep=None,
):
    ch = logging.StreamHandler()
    formatter = logging.Formatter(fmt=fmt)
    ch.setFormatter(fmt=formatter)
    if to_keep is not None:
        assert type(to_keep) == list

        def filter_(record):
            return record.name in to_keep

        ch.addFilter(filter_)
    logger = logging.getLogger()
    logger.setLevel(level=level)
    logger.addHandler(hdlr=ch)
    return logger
