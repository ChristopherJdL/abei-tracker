"""HTTP and CORS utilities for AWS Lambda Function URL."""

import json
import base64

def build_cors_headers() -> dict[str, str]:
    """
    Return standard response headers.
    Note: Access-Control-Allow-* headers are handled automatically by the AWS
    Lambda Function URL configuration. Do NOT manually add Access-Control-Allow-Origin
    here to prevent browser rejection from duplicate '*, *' headers.
    """
    return {
        'Content-Type': 'application/json',
    }

def build_response(status_code: int, body_data: dict) -> dict:
    """Format standard API Gateway / Function URL JSON response."""
    return {
        'statusCode': status_code,
        'headers': build_cors_headers(),
        'body': json.dumps(body_data),
        'isBase64Encoded': False,
    }

def parse_event_body(event: dict) -> dict:
    """Extract and decode JSON payload from Lambda event."""
    body_str = event.get('body', '{}')
    if event.get('isBase64Encoded', False):
        body_str = base64.b64decode(body_str).decode('utf-8')
    if isinstance(body_str, dict):
        return body_str
    try:
        return json.loads(body_str)
    except json.JSONDecodeError:
        return {}

def is_cors_preflight(event: dict) -> bool:
    """Check if the incoming request is an HTTP OPTIONS preflight."""
    return event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS'
