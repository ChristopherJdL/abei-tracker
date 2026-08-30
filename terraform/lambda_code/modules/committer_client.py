"""Client for invoking the downstream GitHub Committer Lambda asynchronously or synchronously."""

import os
import json
import boto3

def invoke_github_committer(sighting: dict, image_b64: str | None, github_token: str, committer_lambda_name: str | None = None) -> None:
    """Invoke Lambda #2 to perform the Git commit."""
    lambda_name = committer_lambda_name or os.environ.get('GITHUB_COMMITTER_LAMBDA_NAME', 'github-committer')
    lambda_client = boto3.client('lambda')

    payload = {
        'sighting': sighting,
        'image_b64': image_b64,
        'github_token': github_token,
    }

    try:
        response = lambda_client.invoke(
            FunctionName=lambda_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload),
        )
        status_code = response.get('StatusCode', 0)
        print(f"[CommitterClient] 📬 Invoked '{lambda_name}' -> StatusCode: {status_code}")
    except Exception as err:
        raise RuntimeError(f"Committer Lambda '{lambda_name}' invocation failed: {err}") from err
