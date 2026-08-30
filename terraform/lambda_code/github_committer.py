"""
AWS Lambda #2: Atomic GitHub Committer.
Receives sighting metadata and optional image base64, then atomically commits
changes to the main branch via the GitHub Git Data REST API.
"""

import os
import json
import base64
import urllib.request
import urllib.error
import traceback
from typing import NamedTuple


class CommitterRequest(NamedTuple):
    sighting: dict
    image_b64: str | None
    github_token: str
    owner: str
    repo: str


def parse_event_payload(event) -> dict:
    """Parse JSON payload from event dict or string body."""
    if isinstance(event, dict) and 'body' in event:
        body_str = event['body']
        if event.get('isBase64Encoded', False):
            body_str = base64.b64decode(body_str).decode('utf-8')
        return json.loads(body_str) if isinstance(body_str, str) else body_str
    if isinstance(event, dict):
        return event
    return json.loads(event)


def validate_committer_inputs(payload: dict) -> CommitterRequest:
    """Validate required sighting data and tokens."""
    sighting = payload.get('sighting')
    github_token = payload.get('github_token') or os.environ.get('GITHUB_TOKEN')
    image_b64 = payload.get('image_b64')
    owner = payload.get('github_owner') or os.environ.get('GITHUB_OWNER', 'ChristopherJdL')
    repo = payload.get('github_repo') or os.environ.get('GITHUB_REPO', 'abei-tracker')

    if not sighting or not github_token:
        raise ValueError("Missing required 'sighting' or 'github_token'.")

    is_cdn = bool(sighting.get('image', '').startswith('http'))
    if not is_cdn and not image_b64:
        raise ValueError("Missing required 'image_b64' for local scene commit.")

    return CommitterRequest(
        sighting=sighting,
        image_b64=image_b64,
        github_token=github_token,
        owner=owner,
        repo=repo,
    )


def make_github_request(url: str, method: str, token: str, data: dict | None = None) -> dict:
    """Execute authenticated GitHub REST API request."""
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'AWS-Lambda-GitHub-Committer',
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


def fetch_head_commit_and_tree(base_url: str, token: str) -> tuple[str, str]:
    """Retrieve the current commit SHA and root tree SHA of the main branch."""
    ref_res = make_github_request(f"{base_url}/git/refs/heads/main", 'GET', token)
    commit_sha = ref_res['object']['sha']

    commit_res = make_github_request(f"{base_url}/git/commits/{commit_sha}", 'GET', token)
    tree_sha = commit_res['tree']['sha']

    return commit_sha, tree_sha


def fetch_and_update_locations(base_url: str, token: str, sighting: dict) -> str:
    """Fetch public/locations.json from GitHub, upsert the new sighting, and return formatted JSON."""
    loc_url = f"{base_url}/contents/public/locations.json?ref=main"
    loc_file = make_github_request(loc_url, 'GET', token)
    locations = json.loads(base64.b64decode(loc_file['content']).decode('utf-8'))

    # Upsert sighting by ID
    existing_idx = next((i for i, s in enumerate(locations) if s.get('id') == sighting['id']), None)
    if existing_idx is not None:
        locations[existing_idx] = sighting
    else:
        locations.append(sighting)

    return json.dumps(locations, indent=2)


def create_image_blob(base_url: str, token: str, image_b64: str) -> str:
    """Create a Git binary blob for a local scene image."""
    clean_b64 = image_b64.split(',')[1] if ',' in image_b64 else image_b64
    blob_res = make_github_request(f"{base_url}/git/blobs", 'POST', token, {
        "content": clean_b64,
        "encoding": "base64",
    })
    return blob_res['sha']


def build_git_tree_entries(base_url: str, token: str, sighting: dict, updated_locations_json: str, image_b64: str | None) -> tuple[list[dict], str]:
    """
    Construct tree entries.
    If image is hosted on CDN, only locations.json is added (no Git blob created).
    """
    tree_entries = [
        {
            "path": "public/locations.json",
            "mode": "100644",
            "type": "blob",
            "content": updated_locations_json,
        }
    ]

    is_cdn = bool(sighting.get('image', '').startswith('http'))
    if not is_cdn and image_b64:
        image_sha = create_image_blob(base_url, token, image_b64)
        image_path = f"public/scenes/{sighting['id']}.png"
        tree_entries.append({
            "path": image_path,
            "mode": "100644",
            "type": "blob",
            "sha": image_sha,
        })
        commit_msg = f"[lambda-triggered] add sighting & scene for {sighting['id']}"
    else:
        commit_msg = f"[lambda-triggered] add sighting for {sighting['id']} (CDN scene)"

    return tree_entries, commit_msg


def commit_and_push(base_url: str, token: str, commit_sha: str, tree_sha: str, tree_entries: list[dict], commit_msg: str) -> str:
    """Create the new tree, commit object, and update the main branch ref."""
    # 1. Create Tree
    tree_res = make_github_request(f"{base_url}/git/trees", 'POST', token, {
        "base_tree": tree_sha,
        "tree": tree_entries,
    })
    new_tree_sha = tree_res['sha']

    # 2. Create Commit
    new_commit = make_github_request(f"{base_url}/git/commits", 'POST', token, {
        "message": commit_msg,
        "tree": new_tree_sha,
        "parents": [commit_sha],
    })
    new_commit_sha = new_commit['sha']

    # 3. Update main branch reference
    make_github_request(f"{base_url}/git/refs/heads/main", 'PATCH', token, {
        "sha": new_commit_sha,
    })

    return new_commit_sha


def commit_sighting_atomic(req: CommitterRequest) -> str:
    """Orchestrate the atomic Git commit workflow."""
    base_url = f"https://api.github.com/repos/{req.owner}/{req.repo}"

    commit_sha, tree_sha = fetch_head_commit_and_tree(base_url, req.github_token)
    updated_locations = fetch_and_update_locations(base_url, req.github_token, req.sighting)
    tree_entries, commit_msg = build_git_tree_entries(base_url, req.github_token, req.sighting, updated_locations, req.image_b64)

    new_sha = commit_and_push(base_url, req.github_token, commit_sha, tree_sha, tree_entries, commit_msg)
    print(f"[Committer] ✅ Committed '{req.sighting['id']}' to main ({new_sha[:8]}): {commit_msg}")
    return new_sha


def lambda_handler(event, context):
    """Entry point for Lambda #2."""
    print(f"[Committer] 🚀 Starting GitHub committer...")
    try:
        payload = parse_event_payload(event)
        req = validate_committer_inputs(payload)
        new_sha = commit_sighting_atomic(req)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': 'Deployment triggered on GitHub/Vercel!',
                'commit_sha': new_sha,
            }),
        }

    except ValueError as val_err:
        print(f"[Committer Validation Error] ❌ {val_err}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': str(val_err)}),
        }
    except Exception as err:
        error_trace = traceback.format_exc()
        print(f"[Committer Fatal Error] 💥 {err}\n{error_trace}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(err), 'traceback': error_trace}),
        }

