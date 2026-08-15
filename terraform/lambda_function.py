import json
import base64
import os
import io
import datetime
import boto3
from google import genai
from PIL import Image

def build_cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json'
    }

def build_response(status_code: int, body_data: dict):
    return {
        'statusCode': status_code,
        'headers': build_cors_headers(),
        'body': json.dumps(body_data)
    }

def parse_event_body(event: dict) -> dict:
    body_str = event.get('body', '{}')
    if event.get('isBase64Encoded', False):
        body_str = base64.b64decode(body_str).decode('utf-8')
    return json.loads(body_str)

def decode_reference_image(b64_str: str):
    if not b64_str:
        return None
    try:
        if ',' in b64_str:
            b64_str = b64_str.split(',')[1]
        image_data = base64.b64decode(b64_str)
        return Image.open(io.BytesIO(image_data))
    except Exception as e:
        print(f"[Warning] Failed to decode reference image: {str(e)}")
        return None

def generate_gemini_image(api_key: str, prompt: str, ref_image=None) -> str:
    print(f"Calling Gemini model for prompt: {prompt}")
    client = genai.Client(api_key=api_key)
    
    contents = [prompt]
    if ref_image:
        contents.append(ref_image)

    response = client.models.generate_content(
        model="gemini-3.1-flash-image",
        contents=contents
    )

    for part in response.parts:
        if part.inline_data:
            img_bytes = part.inline_data.data
            return base64.b64encode(img_bytes).decode('utf-8')

    raise ValueError("Gemini API response did not contain inline image data.")

def build_sighting_metadata(prompt: str) -> dict:
    clean_id = "".join(c if c.isalnum() else "-" for c in prompt.lower()).strip("-")[:30]
    return {
        "id": clean_id,
        "title": prompt.strip().title()[:30],
        "subtitle": f"Abei seen: {prompt.strip()}",
        "lat": 51.5074,
        "lng": -0.1278,
        "image": f"/scenes/{clean_id}.png",
        "status": "CONFIRMED",
        "createdOn": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

def trigger_github_committer(sighting: dict, image_b64: str, github_token: str):
    committer_lambda = os.environ.get('GITHUB_COMMITTER_LAMBDA_NAME', 'github-committer')
    try:
        lambda_client = boto3.client('lambda')
        payload = {
            'image_b64': image_b64,
            'sighting': sighting,
            'github_token': github_token
        }

        lambda_client.invoke(
            FunctionName=committer_lambda,
            InvocationType='Event', # Asynchronous trigger
            Payload=json.dumps(payload)
        )
        print(f"Successfully triggered asynchronous committer Lambda '{committer_lambda}'")
    except Exception as err:
        print(f"[Error] Failed to invoke committer Lambda: {str(err)}")

def lambda_handler(event, context):
    # Handle CORS OPTIONS preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return build_response(200, {})

    try:
        # 1. Parse Inputs
        body = parse_event_body(event)
        prompt = body.get('prompt')
        api_key = body.get('api_key') or os.environ.get('GEMINI_API_KEY')
        github_token = body.get('github_token') or os.environ.get('GITHUB_TOKEN')

        if not prompt:
            return build_response(400, {'error': 'Missing required parameter: prompt'})

        if not api_key:
            return build_response(400, {'error': 'Missing Gemini API Key.'})

        # 2. Decode Reference Image & Generate Scene
        ref_image = decode_reference_image(body.get('reference_image'))
        generated_b64 = generate_gemini_image(api_key, prompt, ref_image)

        # 3. Create Sighting Metadata & Trigger GitHub Committer
        sighting = build_sighting_metadata(prompt)
        trigger_github_committer(sighting, generated_b64, github_token)

        # 4. Return Immediate Success
        return build_response(200, {
            'success': True,
            'message': 'Image generated and queued for GitHub deployment.',
            'image': f"data:image/png;base64,{generated_b64}"
        })

    except Exception as err:
        print(f"[Fatal Error] {str(err)}")
        return build_response(500, {'error': f'Internal Server Error: {str(err)}'})
