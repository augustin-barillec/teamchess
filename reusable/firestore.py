def get_dicts(items_ref):
    return {item.id: item.to_dict() for item in items_ref.stream()}
