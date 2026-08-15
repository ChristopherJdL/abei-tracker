import json
import base64
import os
import urllib.request
import traceback

def parse_event_payload(event) -> dict:
    if isinstance(event, dict) and 'body' in event:
        body_str = event['body']
        if event.get('isBase64Encoded', False):
            body_str = base64.b64decode(body_str).decode('utf-8')
        return json.loads(body_str)
    elif isinstance(event, dict):
        return event
    return json.loads(event)

def make_github_request(url: str, method: str, token: str, data: dict = None) -> dict:
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'AWS-Lambda-GitHub-Committer'
    }
    
    encoded_data = json.dumps(data).encode('utf-8') if data else None
    request = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request) as response:
            res_text = response.read().decode('utf-8')
            return json.loads(res_text) if res_text else {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        print(f"[GitHub API HTTPError {e.code}] {url}: {e.reason}\nBody: {error_body}")
        raise RuntimeError(f"GitHub API Error {e.code}: {e.reason} - {error_body}") from e

def upload_scene_image(owner: str, repo: str, token: str, sighting_id: str, image_b64: str):
    image_path = f"public/scenes/{sighting_id}.png"
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{image_path}"
    
    clean_b64 = image_b64.split(',')[1] if ',' in image_b64 else image_b64
    
    # Check if file already exists to supply sha for overwrite
    existing_sha = None
    try:
        get_res = make_github_request(f"{url}?ref=main", 'GET', token)
        existing_sha = get_res.get('sha')
    except Exception:
        existing_sha = None

    payload = {
        "message": f"feat: add scene image for {sighting_id} via Lambda #2",
        "content": clean_b64,
        "branch": "main"
    }
    if existing_sha:
        payload["sha"] = existing_sha

    make_github_request(url, 'PUT', token, payload)
    print(f"[Info] Uploaded scene image '{image_path}' to GitHub")

def update_locations_json(owner: str, repo: str, token: str, sighting: dict):
    get_url = f"https://api.github.com/repos/{owner}/{repo}/contents/public/locations.json?ref=main"
    put_url = f"https://api.github.com/repos/{owner}/{repo}/contents/public/locations.json"
    
    # 1. Fetch current locations.json from latest main branch HEAD
    loc_file = make_github_request(get_url, 'GET', token)
    current_sha = loc_file['sha']
    current_json = json.loads(base64.b64decode(loc_file['content']).decode('utf-8'))

    # 2. Update existing entry or append new sighting
    existing_index = next((i for i, s in enumerate(current_json) if s.get('id') == sighting['id']), None)
    if existing_index is not None:
        current_json[existing_index] = sighting
        print(f"[Info] Updated existing sighting entry '{sighting['id']}' in locations.json")
    else:
        current_json.append(sighting)
        print(f"[Info] Appended new sighting entry '{sighting['id']}' (total {len(current_json)} items) to locations.json")

    # 3. Commit updated locations.json
    updated_b64 = base64.b64encode(json.dumps(current_json, indent=2).encode('utf-8')).decode('utf-8')
    payload = {
        "message": f"feat: add new sighting {sighting.get('title')} via Lambda #2",
        "content": updated_b64,
        "sha": current_sha,
        "branch": "main"
    }

    make_github_request(put_url, 'PUT', token, payload)
    print(f"[Info] Successfully committed public/locations.json on GitHub for sighting '{sighting['id']}'")

def lambda_handler(event, context):
    print(f"[Info] GitHub Committer Lambda #2 started with event: {json.dumps(event)}")
    try:
        payload = parse_event_payload(event)

        image_b64 = payload.get('image_b64')
        sighting = payload.get('sighting')
        github_token = payload.get('github_token') or os.environ.get('GITHUB_TOKEN')
        owner = payload.get('github_owner') or os.environ.get('GITHUB_OWNER', 'ChristopherJdL')
        repo = payload.get('github_repo') or os.environ.get('GITHUB_REPO', 'abei-tracker')

        if not image_b64 or not sighting or not github_token:
            err_msg = 'Missing required image_b64, sighting, or github_token.'
            print(f"[Error] {err_msg}")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': err_msg})
            }

        # 1. Upload PNG image
        upload_scene_image(owner, repo, github_token, sighting['id'], image_b64)

        # 2. Append/Update locations.json
        update_locations_json(owner, repo, github_token, sighting)

        print("[Success] All GitHub files committed successfully!")
        return {
            'statusCode': 200,
            'body': json.dumps({'success': True, 'message': 'Deployment triggered on GitHub/Vercel!'})
        }

    except Exception as err:
        error_trace = traceback.format_exc()
        print(f"[Fatal Error in Lambda #2] {str(err)}\n{error_trace}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(err), 'traceback': error_trace})
        }
