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

def commit_sighting_and_image(owner: str, repo: str, token: str, sighting: dict, image_b64: str = None):
    base_url = f"https://api.github.com/repos/{owner}/{repo}"
    
    # 1. Get current commit and tree SHAs
    ref_res = make_github_request(f"{base_url}/git/refs/heads/main", 'GET', token)
    commit_sha = ref_res['object']['sha']
    
    commit_res = make_github_request(f"{base_url}/git/commits/{commit_sha}", 'GET', token)
    tree_sha = commit_res['tree']['sha']
    
    # 2. Get current locations.json
    loc_url = f"{base_url}/contents/public/locations.json?ref=main"
    loc_file = make_github_request(loc_url, 'GET', token)
    current_json = json.loads(base64.b64decode(loc_file['content']).decode('utf-8'))
    
    # Update locations
    existing_index = next((i for i, s in enumerate(current_json) if s.get('id') == sighting['id']), None)
    if existing_index is not None:
        current_json[existing_index] = sighting
    else:
        current_json.append(sighting)
        
    updated_locations = json.dumps(current_json, indent=2)
    
    tree_entries = [
        {
            "path": "public/locations.json",
            "mode": "100644",
            "type": "blob",
            "content": updated_locations
        }
    ]

    is_cdn = bool(sighting.get('image', '').startswith('http'))

    # 3. Create blob for the image ONLY if not hosted on CDN and image_b64 is provided
    if not is_cdn and image_b64:
        clean_b64 = image_b64.split(',')[1] if ',' in image_b64 else image_b64
        blob_res = make_github_request(f"{base_url}/git/blobs", 'POST', token, {
            "content": clean_b64,
            "encoding": "base64"
        })
        image_sha = blob_res['sha']
        image_path = f"public/scenes/{sighting['id']}.png"
        tree_entries.append({
            "path": image_path,
            "mode": "100644",
            "type": "blob",
            "sha": image_sha
        })
        commit_msg = f"[lambda-triggered] add sighting & scene for {sighting['id']}"
    else:
        commit_msg = f"[lambda-triggered] add sighting for {sighting['id']} (CDN scene)"
    
    # 4. Create new tree
    tree_res = make_github_request(f"{base_url}/git/trees", 'POST', token, {
        "base_tree": tree_sha,
        "tree": tree_entries
    })
    new_tree_sha = tree_res['sha']
    
    # 5. Create new commit
    new_commit_res = make_github_request(f"{base_url}/git/commits", 'POST', token, {
        "message": commit_msg,
        "tree": new_tree_sha,
        "parents": [commit_sha]
    })
    new_commit_sha = new_commit_res['sha']
    
    # 6. Update reference
    make_github_request(f"{base_url}/git/refs/heads/main", 'PATCH', token, {
        "sha": new_commit_sha
    })
    
    if is_cdn:
        print(f"[Info] Successfully committed public/locations.json on GitHub for sighting '{sighting['id']}' (CDN hosted, no Git image blob)")
    else:
        print(f"[Info] Successfully committed public/locations.json and {image_path} on GitHub for sighting '{sighting['id']}' atomically")

def lambda_handler(event, context):
    print(f"[Info] GitHub Committer Lambda #2 started with event: {json.dumps(event)}")
    try:
        payload = parse_event_payload(event)

        image_b64 = payload.get('image_b64')
        sighting = payload.get('sighting')
        github_token = payload.get('github_token') or os.environ.get('GITHUB_TOKEN')
        owner = payload.get('github_owner') or os.environ.get('GITHUB_OWNER', 'ChristopherJdL')
        repo = payload.get('github_repo') or os.environ.get('GITHUB_REPO', 'abei-tracker')

        if not sighting or not github_token:
            err_msg = 'Missing required sighting or github_token.'
            print(f"[Error] {err_msg}")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': err_msg})
            }

        is_cdn = bool(sighting.get('image', '').startswith('http'))
        if not is_cdn and not image_b64:
            err_msg = 'Missing required image_b64 for local scene commit.'
            print(f"[Error] {err_msg}")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': err_msg})
            }

        # 1. Atomic Commit
        commit_sighting_and_image(owner, repo, github_token, sighting, image_b64)

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
