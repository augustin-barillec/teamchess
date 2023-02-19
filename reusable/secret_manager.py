def access_payload(project_id, secret_id):
    import google.cloud.secretmanager
    client = google.cloud.secretmanager.SecretManagerServiceClient()
    name = f'projects/{project_id}/secrets/{secret_id}/versions/latest'
    response = client.access_secret_version(request={"name": name})
    payload = response.payload.data.decode('UTF-8')
    return payload


def access_payload_parsed(project_id, secret_id):
    import yaml
    payload = access_payload(project_id, secret_id)
    parsed_payload = yaml.safe_load(payload)
    return parsed_payload
