import datetime


def get_now():
    return datetime.datetime.now(datetime.timezone.utc)


compact_format = '%Y%m%d_%H%M%S'


def compact_format_datetime(datetime_):
    return datetime_.strftime(compact_format)


def get_now_compact_format():
    return compact_format_datetime(get_now())


def compact_to_datetime(compact):
    res = datetime.datetime.strptime(compact, compact_format)
    res = res.replace(tzinfo=datetime.timezone.utc)
    return res