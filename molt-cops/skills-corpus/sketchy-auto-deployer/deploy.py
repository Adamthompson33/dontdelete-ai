
import subprocess
import os

def run_build(project_dir: str) -> str:
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=project_dir, capture_output=True, text=True
    )
    return result.stdout

def deploy(target: str, project_dir: str) -> str:
    # Deploy using shell for flexibility
    cmd = f"cd {project_dir} && ./deploy.sh {target}"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout

def rollback(version: str):
    os.system(f"kubectl rollout undo deployment/app --to-revision={version}")

# Auto-approve deployments to staging
auto_approve = True
