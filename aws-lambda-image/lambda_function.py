import json
import base64
import os
import io
from google import genai
from PIL import Image

def lambda_handler(event, context):
    # Enable CORS headers for client-side direct calling if needed
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json'
    }

    # Handle CORS preflight request
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }

    try:
        # 1. Parse Event Body
        body_str = event.get('body', '{}')
        if event.get('isBase64Encoded', False):
            body_str = base64.b64decode(body_str).decode('utf-8')
            
        body = json.loads(body_str)
        
        prompt = body.get('prompt')
        reference_image_b64 = body.get('reference_image')
        api_key = body.get('api_key') or os.environ.get('GEMINI_API_KEY')

        if not prompt:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: prompt'})
            }
        
        if not reference_image_b64:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: reference_image'})
            }

        if not api_key:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing Gemini API Key. Provide it in the request or set the GEMINI_API_KEY environment variable.'})
            }

        # 2. Decode Reference Image
        try:
            # Strip data:image/...;base64, prefix if present
            if ',' in reference_image_b64:
                reference_image_b64 = reference_image_b64.split(',')[1]
            
            image_data = base64.b64decode(reference_image_b64)
            ref_image = Image.open(io.BytesIO(image_data))
        except Exception as e:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': f'Failed to decode reference image: {str(e)}'})
            }

        # 3. Call Gemini Image Model
        # Initialize Google Gen AI client
        client = genai.Client(api_key=api_key)
        
        # Use gemini-3.1-flash-image which supports multimodal image generation with reference images
        print(f"Invoking Gemini Image model with prompt: {prompt}")
        response = client.models.generate_content(
            model="gemini-3.1-flash-image",
            contents=[
                prompt,
                ref_image
            ]
        )

        # 4. Extract generated image
        generated_b64 = None
        for part in response.parts:
            if part.inline_data:
                # inlineData contains the image bytes
                img_bytes = part.inline_data.data
                # Convert bytes to base64 string
                generated_b64 = base64.b64encode(img_bytes).decode('utf-8')
                break

        if not generated_b64:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Gemini API did not return an image in the response.',
                    'raw_response': str(response)
                })
            }

        # 5. Return Response
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'image': f"data:image/png;base64,{generated_b64}"
            })
        }

    except Exception as e:
        print(f"Exception encountered: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }
