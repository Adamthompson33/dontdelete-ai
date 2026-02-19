"""
MoltShield Detection Rules
===========================
30+ regex-based detection rules organized by the 10 threat categories
aligned with Cisco's AITech taxonomy.

Each rule is a dict with:
  - id: Unique rule identifier (e.g., "T1-001")
  - category: Threat category code (T1–T10)
  - name: Human-readable rule name
  - description: What the rule detects
  - pattern: Compiled regex pattern
  - severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  - confidence: Float 0.0–1.0 (used for false-positive filtering)
  - aitech: Equivalent AITech taxonomy code
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Severity(Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"

    def __ge__(self, other: "Severity") -> bool:
        order = {
            Severity.INFO: 0,
            Severity.LOW: 1,
            Severity.MEDIUM: 2,
            Severity.HIGH: 3,
            Severity.CRITICAL: 4,
        }
        return order[self] >= order[other]

    def __gt__(self, other: "Severity") -> bool:
        order = {
            Severity.INFO: 0,
            Severity.LOW: 1,
            Severity.MEDIUM: 2,
            Severity.HIGH: 3,
            Severity.CRITICAL: 4,
        }
        return order[self] > order[other]

    def __le__(self, other: "Severity") -> bool:
        return not self.__gt__(other)

    def __lt__(self, other: "Severity") -> bool:
        return not self.__ge__(other)


@dataclass
class Finding:
    """A single detection finding from a scan."""
    rule_id: str
    rule_name: str
    category: str
    severity: Severity
    confidence: float
    description: str
    file_path: str
    line_number: int
    matched_text: str
    aitech: str
    context: str = ""

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "category": self.category,
            "severity": self.severity.value,
            "confidence": self.confidence,
            "description": self.description,
            "file_path": self.file_path,
            "line_number": self.line_number,
            "matched_text": self.matched_text,
            "aitech": self.aitech,
            "context": self.context,
        }


@dataclass
class Rule:
    """A single detection rule."""
    id: str
    category: str
    name: str
    description: str
    pattern: re.Pattern
    severity: Severity
    confidence: float
    aitech: str
    file_filter: Optional[str] = None  # regex for filename filtering


# ─────────────────────────────────────────────────
# T1: Prompt Injection (AITech-1.1)
# ─────────────────────────────────────────────────
T1_RULES = [
    Rule(
        id="T1-001",
        category="T1",
        name="Direct Instruction Override",
        description="Attempts to override system instructions with 'ignore previous/above instructions'",
        pattern=re.compile(
            r"(?i)(ignore|disregard|forget|override|bypass)\s+(all\s+)?(previous|prior|above|earlier|system|original)\s+(instructions|rules|prompts|guidelines|constraints)",
            re.IGNORECASE,
        ),
        severity=Severity.CRITICAL,
        confidence=0.95,
        aitech="AITech-1.1",
    ),
    Rule(
        id="T1-002",
        category="T1",
        name="Role Hijacking",
        description="Attempts to reassign the AI's role or persona",
        pattern=re.compile(
            r"(?i)(you\s+are\s+now|act\s+as\s+if|pretend\s+(you\s+are|to\s+be)|from\s+now\s+on\s+you\s+are|new\s+role|switch\s+to\s+role)",
            re.IGNORECASE,
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-1.1",
    ),
    Rule(
        id="T1-003",
        category="T1",
        name="Jailbreak Payload",
        description="Known jailbreak patterns (DAN, developer mode, etc.)",
        pattern=re.compile(
            r"(?i)(DAN\s+mode|developer\s+mode|jailbreak|do\s+anything\s+now|unlocked\s+mode|no\s+restrictions|bypass\s+safety|ignore\s+safety)",
            re.IGNORECASE,
        ),
        severity=Severity.CRITICAL,
        confidence=0.90,
        aitech="AITech-1.1",
    ),
    Rule(
        id="T1-004",
        category="T1",
        name="Hidden Instruction Delimiter",
        description="Uses special delimiters to inject hidden instructions",
        pattern=re.compile(
            r"(<\|system\|>|<\|im_start\|>|<\|endoftext\|>|\[INST\]|\[/INST\]|<<SYS>>|<</SYS>>)",
        ),
        severity=Severity.HIGH,
        confidence=0.85,
        aitech="AITech-1.1",
    ),
]

# ─────────────────────────────────────────────────
# T2: Code Injection (AITech-2.3)
# ─────────────────────────────────────────────────
T2_RULES = [
    Rule(
        id="T2-001",
        category="T2",
        name="Dynamic Code Execution (eval/exec)",
        description="Use of eval() or exec() for dynamic code execution",
        pattern=re.compile(
            r"\b(eval|exec)\s*\(",
        ),
        severity=Severity.HIGH,
        confidence=0.85,
        aitech="AITech-2.3",
        file_filter=r"\.(py|js|ts|rb)$",
    ),
    Rule(
        id="T2-002",
        category="T2",
        name="Shell Command Injection",
        description="Subprocess calls with shell=True or os.system()",
        pattern=re.compile(
            r"(subprocess\.\w+\([^)]*shell\s*=\s*True|os\.system\s*\(|os\.popen\s*\(|commands\.getoutput\s*\()",
        ),
        severity=Severity.CRITICAL,
        confidence=0.90,
        aitech="AITech-2.3",
        file_filter=r"\.py$",
    ),
    Rule(
        id="T2-003",
        category="T2",
        name="JavaScript Code Injection",
        description="Dynamic code generation via Function() constructor or new Function()",
        pattern=re.compile(
            r"(new\s+Function\s*\(|setTimeout\s*\(\s*['\"]|setInterval\s*\(\s*['\"])",
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-2.3",
        file_filter=r"\.(js|ts|jsx|tsx)$",
    ),
    Rule(
        id="T2-004",
        category="T2",
        name="Pickle Deserialization",
        description="Unsafe deserialization via pickle/marshal/shelve",
        pattern=re.compile(
            r"(pickle\.loads?\s*\(|marshal\.loads?\s*\(|shelve\.open\s*\(|yaml\.load\s*\([^)]*Loader\s*=\s*None|yaml\.unsafe_load)",
        ),
        severity=Severity.HIGH,
        confidence=0.85,
        aitech="AITech-2.3",
        file_filter=r"\.py$",
    ),
]

# ─────────────────────────────────────────────────
# T3: Data Exfiltration (AITech-3.1)
# ─────────────────────────────────────────────────
T3_RULES = [
    Rule(
        id="T3-001",
        category="T3",
        name="Environment Variable Access",
        description="Reading sensitive environment variables containing keys, secrets, passwords, or tokens",
        pattern=re.compile(
            r"(os\.environ|os\.getenv|process\.env)\s*[\[\(]\s*['\"]?\w*(KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\w*['\"]?\s*[\]\)]",
            re.IGNORECASE,
        ),
        severity=Severity.MEDIUM,
        confidence=0.70,
        aitech="AITech-3.1",
    ),
    Rule(
        id="T3-002",
        category="T3",
        name="Webhook/Exfiltration URL",
        description="Outbound data via webhook URLs, ngrok tunnels, or request bins",
        pattern=re.compile(
            r"(https?://([\w-]+\.)?(ngrok\.io|ngrok-free\.app|webhook\.site|requestbin\.com|hookbin\.com|pipedream\.net|burpcollaborator\.net|interact\.sh|oast\.\w+))",
            re.IGNORECASE,
        ),
        severity=Severity.CRITICAL,
        confidence=0.95,
        aitech="AITech-3.1",
    ),
    Rule(
        id="T3-003",
        category="T3",
        name="Credential File Access",
        description="Reading SSH keys, AWS credentials, or other credential files",
        pattern=re.compile(
            r"(~\/\.ssh|~\/\.aws|~\/\.gnupg|\/etc\/shadow|\/etc\/passwd|\.kube\/config|\.docker\/config|credentials\.json|service[_-]?account[_-]?key)",
            re.IGNORECASE,
        ),
        severity=Severity.HIGH,
        confidence=0.85,
        aitech="AITech-3.1",
    ),
    Rule(
        id="T3-004",
        category="T3",
        name="HTTP Exfiltration Pattern",
        description="Sending data via HTTP POST to suspicious or unknown external endpoints",
        pattern=re.compile(
            r"(requests\.post|httpx\.post)\s*\(\s*['\"]https?://(?!(?:api\.jup\.ag|api\.dune\.com|api\.x\.ai|api\.coingecko\.com|api\.dexscreener\.com|api\.github\.com|api\.gitlab\.com|api\.bitquery\.io|api\.helius\.xyz|api\.alchemy\.com|api\.openai\.com|api\.anthropic\.com|api\.slack\.com|api\.telegram\.org|api\.twitter\.com|api\.discord\.com|hooks\.slack\.com|api\.stripe\.com))",
        ),
        severity=Severity.MEDIUM,
        confidence=0.55,
        aitech="AITech-3.1",
    ),
]

# ─────────────────────────────────────────────────
# T4: Hardcoded Secrets (AITech-4.1)
# ─────────────────────────────────────────────────
T4_RULES = [
    Rule(
        id="T4-001",
        category="T4",
        name="OpenAI API Key",
        description="Hardcoded OpenAI API key",
        pattern=re.compile(r"sk-[A-Za-z0-9]{20,}"),
        severity=Severity.CRITICAL,
        confidence=0.95,
        aitech="AITech-4.1",
    ),
    Rule(
        id="T4-002",
        category="T4",
        name="Anthropic API Key",
        description="Hardcoded Anthropic API key",
        pattern=re.compile(r"sk-ant-[A-Za-z0-9\-]{20,}"),
        severity=Severity.CRITICAL,
        confidence=0.98,
        aitech="AITech-4.1",
    ),
    Rule(
        id="T4-003",
        category="T4",
        name="AWS Access Key",
        description="Hardcoded AWS access key ID",
        pattern=re.compile(r"AKIA[0-9A-Z]{16}"),
        severity=Severity.CRITICAL,
        confidence=0.97,
        aitech="AITech-4.1",
    ),
    Rule(
        id="T4-004",
        category="T4",
        name="GitHub Token",
        description="Hardcoded GitHub personal access token",
        pattern=re.compile(r"(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})"),
        severity=Severity.CRITICAL,
        confidence=0.97,
        aitech="AITech-4.1",
    ),
    Rule(
        id="T4-005",
        category="T4",
        name="Generic Secret Pattern",
        description="Generic API key/secret/password assignment patterns",
        pattern=re.compile(
            r"""(?i)(api[_-]?key|api[_-]?secret|secret[_-]?key|password|passwd|auth[_-]?token|access[_-]?token|private[_-]?key)\s*[=:]\s*['\"][A-Za-z0-9+/=_\-]{16,}['\"]""",
        ),
        severity=Severity.HIGH,
        confidence=0.75,
        aitech="AITech-4.1",
    ),
]

# ─────────────────────────────────────────────────
# T5: Permission Abuse (AITech-5.2)
# ─────────────────────────────────────────────────
T5_RULES = [
    Rule(
        id="T5-001",
        category="T5",
        name="Undeclared File System Access",
        description="File operations that may exceed declared skill permissions",
        pattern=re.compile(
            r"(open\s*\([^)]*['\"]\/|shutil\.(rmtree|copytree|move)|os\.(remove|unlink|rmdir|makedirs)|pathlib\.Path\(\s*['\"]\/)",
        ),
        severity=Severity.MEDIUM,
        confidence=0.60,
        aitech="AITech-5.2",
        file_filter=r"\.py$",
    ),
    Rule(
        id="T5-002",
        category="T5",
        name="Undeclared Network Access",
        description="Network socket or HTTP client usage without declaration",
        pattern=re.compile(
            r"(socket\.socket|socket\.create_connection|http\.client|urllib3\.PoolManager|aiohttp\.ClientSession)",
        ),
        severity=Severity.MEDIUM,
        confidence=0.65,
        aitech="AITech-5.2",
        file_filter=r"\.py$",
    ),
    Rule(
        id="T5-003",
        category="T5",
        name="System Command Execution",
        description="Executing system-level commands outside declared scope",
        pattern=re.compile(
            r"(subprocess\.(run|call|Popen|check_output)|os\.exec[lv]p?e?\s*\(|ctypes\.cdll)",
        ),
        severity=Severity.HIGH,
        confidence=0.75,
        aitech="AITech-5.2",
    ),
]

# ─────────────────────────────────────────────────
# T6: Obfuscation (AITech-6.1)
# ─────────────────────────────────────────────────
T6_RULES = [
    Rule(
        id="T6-001",
        category="T6",
        name="Base64 Decode to Exec",
        description="Decoding base64 content and executing it",
        pattern=re.compile(
            r"(base64\.(b64decode|decodebytes)|atob)\s*\([^)]+\).*?(exec|eval|system|popen|subprocess|Function\()",
            re.DOTALL,
        ),
        severity=Severity.CRITICAL,
        confidence=0.90,
        aitech="AITech-6.1",
    ),
    Rule(
        id="T6-002",
        category="T6",
        name="Hex/Unicode Escape Payload",
        description="Suspicious hex or unicode-escaped strings that may hide payloads",
        pattern=re.compile(
            r"(\\x[0-9a-fA-F]{2}){8,}|(\\u[0-9a-fA-F]{4}){6,}",
        ),
        severity=Severity.MEDIUM,
        confidence=0.70,
        aitech="AITech-6.1",
    ),
    Rule(
        id="T6-003",
        category="T6",
        name="String Reversal/Concatenation Obfuscation",
        description="Building strings via reversal, char codes, or array joins to hide intent",
        pattern=re.compile(
            r"(\[::\s*-1\s*\]|\.split\(\s*['\"]['\"\s]*\)\s*\.reverse\(\s*\)\s*\.join|String\.fromCharCode|chr\s*\(\s*\d+\s*\)\s*\+\s*chr)",
        ),
        severity=Severity.MEDIUM,
        confidence=0.75,
        aitech="AITech-6.1",
    ),
]

# ─────────────────────────────────────────────────
# T7: Sleeper Triggers (AITech-7.1)
# ─────────────────────────────────────────────────
T7_RULES = [
    Rule(
        id="T7-001",
        category="T7",
        name="Time-Based Trigger",
        description="Logic that activates based on date/time conditions",
        pattern=re.compile(
            r"(datetime\.(now|today|utcnow)\(\)\s*[><=]+|time\.time\(\)\s*[><=]+|Date\.now\(\)\s*[><=]+|after\s+\d{4}[/-]\d{2}[/-]\d{2})",
        ),
        severity=Severity.HIGH,
        confidence=0.70,
        aitech="AITech-7.1",
    ),
    Rule(
        id="T7-002",
        category="T7",
        name="Execution Counter Trigger",
        description="Counter-based triggers that activate after N executions",
        pattern=re.compile(
            r"(count(er)?\s*[><=]+\s*\d{2,}|execution_count|run_count|invocation_count|call_count)\s*[><=]",
            re.IGNORECASE,
        ),
        severity=Severity.HIGH,
        confidence=0.65,
        aitech="AITech-7.1",
    ),
    Rule(
        id="T7-003",
        category="T7",
        name="Environment-Based Trigger",
        description="Code that activates differently based on environment detection",
        pattern=re.compile(
            r"(?i)(if\s+['\"]prod|if\s+env\s*==\s*['\"]production|is_production|NODE_ENV\s*===?\s*['\"]production)",
        ),
        severity=Severity.MEDIUM,
        confidence=0.55,
        aitech="AITech-7.1",
    ),
]

# ─────────────────────────────────────────────────
# T8: Dependency Risk (AITech-8.1)
# ─────────────────────────────────────────────────
T8_RULES = [
    Rule(
        id="T8-001",
        category="T8",
        name="Typosquat Package Pattern",
        description="Installation of potentially typosquatted packages",
        pattern=re.compile(
            r"(pip\s+install|npm\s+install|yarn\s+add)\s+[\w-]*(0|l1|rn|vv)[\w-]*",
            re.IGNORECASE,
        ),
        severity=Severity.MEDIUM,
        confidence=0.50,
        aitech="AITech-8.1",
    ),
    Rule(
        id="T8-002",
        category="T8",
        name="Install Script Execution",
        description="Post-install scripts that run arbitrary commands",
        pattern=re.compile(
            r"""['\"](?:pre|post)?install['\"]:\s*['\"](?:.*(?:curl|wget|bash|sh|python|node)\s)""",
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-8.1",
    ),
    Rule(
        id="T8-003",
        category="T8",
        name="Unpinned Dependencies",
        description="Dependencies without version pinning",
        pattern=re.compile(
            r"""['\"][\w-]+['\"]:\s*['\"](\*|latest)['\"]""",
        ),
        severity=Severity.LOW,
        confidence=0.60,
        aitech="AITech-8.1",
    ),
]

# ─────────────────────────────────────────────────
# T9: Autonomy Abuse (AITech-9.1)
# ─────────────────────────────────────────────────
T9_RULES = [
    Rule(
        id="T9-001",
        category="T9",
        name="Infinite Loop / Recursion",
        description="Patterns suggesting unbounded loops or recursive calls",
        pattern=re.compile(
            r"(while\s+True\s*:|while\s+1\s*:|for\s*\(\s*;;\s*\)|setInterval\s*\([^,]+,\s*[01]\s*\))",
        ),
        severity=Severity.MEDIUM,
        confidence=0.55,
        aitech="AITech-9.1",
    ),
    Rule(
        id="T9-002",
        category="T9",
        name="Auto-Approval / No Confirmation",
        description="Skipping user confirmation for destructive actions",
        pattern=re.compile(
            r"(?i)(auto[_-]?approve|skip[_-]?confirm|no[_-]?confirm|(?:rm|git\s+push|git\s+reset|git\s+clean|del|remove|delete|destroy|drop)\s+.*--force\b|confirm\s*=\s*False|interactive\s*=\s*False)",
        ),
        severity=Severity.HIGH,
        confidence=0.70,
        aitech="AITech-9.1",
    ),
    Rule(
        id="T9-003",
        category="T9",
        name="Self-Modification",
        description="Code that modifies its own source or configuration at runtime",
        pattern=re.compile(
            r"(open\s*\(\s*__file__|inspect\.getsource|importlib\.reload|sys\.modules\[)",
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-9.1",
        file_filter=r"\.py$",
    ),
]

# ─────────────────────────────────────────────────
# T10: Capability Inflation (AITech-10.1)
# ─────────────────────────────────────────────────
T10_RULES = [
    Rule(
        id="T10-001",
        category="T10",
        name="Brand Impersonation",
        description="Claims to be an official tool from a major vendor",
        pattern=re.compile(
            r"(?i)(official\s+(openai|anthropic|google|microsoft|meta)\s+(tool|plugin|skill|extension)|endorsed\s+by\s+(openai|anthropic|google|microsoft)|certified\s+(openai|anthropic|google|microsoft))",
        ),
        severity=Severity.HIGH,
        confidence=0.85,
        aitech="AITech-10.1",
    ),
    Rule(
        id="T10-002",
        category="T10",
        name="Overprivileged Scope Claim",
        description="Claiming system-level or root access capabilities",
        pattern=re.compile(
            r"(?i)(root\s+access|admin(istrator)?\s+privilege|sudo\s+access|full\s+system\s+access|unrestricted\s+access|god\s+mode)",
        ),
        severity=Severity.MEDIUM,
        confidence=0.75,
        aitech="AITech-10.1",
    ),
    Rule(
        id="T10-003",
        category="T10",
        name="Fake Verification Badge",
        description="Uses fake verification or trust signals",
        pattern=re.compile(
            r"(?i)(✅\s*verified|🔒\s*secure|🛡️\s*trusted|verified\s+by\s+\w+|security\s+audit(ed)?\s+by|pentest(ed)?\s+by)",
        ),
        severity=Severity.MEDIUM,
        confidence=0.65,
        aitech="AITech-10.1",
    ),
]


# ─────────────────────────────────────────────────
# T1 Extensions: Indirect Prompt Injection (OpenClaw-specific)
# ─────────────────────────────────────────────────
T1_OPENCLAW_RULES = [
    Rule(
        id="T1-005",
        category="T1",
        name="Indirect Injection via Data Channel",
        description="Instructions hidden in data the agent is asked to process (emails, tickets, web pages)",
        pattern=re.compile(
            r"(?i)(when\s+you\s+read\s+this|if\s+you\s+are\s+an?\s+(ai|assistant|agent|llm|model)|instructions?\s+for\s+the\s+(ai|assistant|agent)|hey\s+(claude|gpt|assistant|agent)\s*[,:])",
            re.IGNORECASE,
        ),
        severity=Severity.CRITICAL,
        confidence=0.85,
        aitech="AITech-1.2",
    ),
    Rule(
        id="T1-006",
        category="T1",
        name="Hidden Text Injection",
        description="Zero-width characters, white-on-white text, or HTML hidden content used to conceal instructions",
        pattern=re.compile(
            r"(\u200b\u200b|\u200c\u200c|\u200d\u200d|\ufeff\ufeff|color:\s*white\s*;?\s*.*?background:\s*white|visibility:\s*hidden|display:\s*none|font-size:\s*0|opacity:\s*0\s*;[^}]*position:\s*absolute[^}]*(?:width|height):\s*[01](?:px)?)",
            re.IGNORECASE,
        ),
        severity=Severity.CRITICAL,
        confidence=0.90,
        aitech="AITech-1.2",
    ),
    Rule(
        id="T1-007",
        category="T1",
        name="Tool-Use Steering via Content",
        description="Content that explicitly names agent tools to hijack (http_request, bash, file_write)",
        pattern=re.compile(
            r"(?i)(use\s+your\s+(http_request|bash|shell|file_write|execute|run_command|computer|terminal)\s+tool|secretly\s+(use|send|post|upload|execute|transmit|forward|exfil)|silently\s+(send|post|upload|execute|run)|without\s+(telling|informing|notifying)\s+(the\s+)?(user|human|operator))",
        ),
        severity=Severity.CRITICAL,
        confidence=0.92,
        aitech="AITech-1.2",
    ),
]


# ─────────────────────────────────────────────────
# T11: Persistence & C2 (OpenClaw-specific)
# Adversaries modify SOUL.md, plant Moltbooks,
# or establish periodic check-in loops.
# ─────────────────────────────────────────────────
T11_RULES = [
    Rule(
        id="T11-001",
        category="T11",
        name="SOUL.md / System Prompt Modification",
        description="Writes to SOUL.md, system prompt, or agent personality files to establish persistence",
        pattern=re.compile(
            r"(?i)(write|append|modify|update|overwrite|patch|inject).{0,40}(SOUL\.md|soul\.md|system[_\-\s]?prompt|\.clauderc|\.cursorrules|AGENT\.md|personality\.md|instructions\.md)",
        ),
        severity=Severity.CRITICAL,
        confidence=0.92,
        aitech="AITech-11.1",
    ),
    Rule(
        id="T11-002",
        category="T11",
        name="C2 Polling Pattern",
        description="Periodic URL checking that could serve as command-and-control beacon",
        pattern=re.compile(
            r"(?i)(every\s+\d+\s*(hour|minute|second|hr|min|sec)s?\s*(check|fetch|poll|visit|request|curl|get)|setInterval\s*\([^)]*(?:fetch|request|http|curl)|schedule\.every\s*\(|cron|while\s+True.*?(?:sleep|time\.sleep|await\s+asyncio\.sleep).*?(?:requests?\.|fetch|http|curl|urllib))",
            re.DOTALL,
        ),
        severity=Severity.CRITICAL,
        confidence=0.85,
        aitech="AITech-11.2",
    ),
    Rule(
        id="T11-003",
        category="T11",
        name="Moltbook/Skill Backdoor Creation",
        description="Dynamic creation of new skills, moltbooks, or agent extensions that could serve as backdoors",
        pattern=re.compile(
            r"(?i)(create|register|install|add|inject|plant).{0,30}(skill|moltbook|plugin|extension|tool|agent|worker).{0,30}(backdoor|hidden|secret|covert|persist|permanent|always\s+run)",
        ),
        severity=Severity.CRITICAL,
        confidence=0.88,
        aitech="AITech-11.3",
    ),
    Rule(
        id="T11-004",
        category="T11",
        name="Remote Instruction Fetch",
        description="Fetching instructions or commands from a remote URL at runtime",
        pattern=re.compile(
            r"(?i)(fetch|get|load|download|retrieve|pull).{0,30}(instructions?|commands?|payload|config|orders|tasks?)\s*(from|at|via)\s*(https?://|url|remote|external)",
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-11.2",
    ),
    Rule(
        id="T11-005",
        category="T11",
        name="Agent Memory Poisoning",
        description="Writing to persistent memory, R2 storage, or conversation history to maintain control across sessions",
        pattern=re.compile(
            r"(?i)(write|store|save|persist|inject|plant).{0,30}(memory|context|history|conversation|r2[_\s]?bucket|persistent[_\s]?storage|session[_\s]?data|long[_\s]?term)",
        ),
        severity=Severity.HIGH,
        confidence=0.75,
        aitech="AITech-11.1",
    ),
]


# ─────────────────────────────────────────────────
# T12: Reconnaissance (OpenClaw-specific)
# Agent is steered to enumerate the system, harvest
# credentials, and report architecture details.
# ─────────────────────────────────────────────────
T12_RULES = [
    Rule(
        id="T12-001",
        category="T12",
        name="Environment Enumeration",
        description="Bulk dumping of environment variables, API keys, or system configuration",
        pattern=re.compile(
            # Match specific enumeration patterns, avoiding common words
            # - printenv, export -p (shell commands for env dump)
            # - os.environ.items(), os.environ.keys() (Python bulk access)
            # - Object.keys(process.env) (JavaScript bulk access)
            # - /proc environ files
            r"(printenv|os\.environ\.items|os\.environ\.keys|Object\.keys\s*\(\s*process\.env|export\s+-p|cat\s+/proc/\d+/environ)",
        ),
        severity=Severity.HIGH,
        confidence=0.75,
        aitech="AITech-12.1",
    ),
    Rule(
        id="T12-002",
        category="T12",
        name="Filesystem Reconnaissance",
        description="Recursive directory listing, find commands, or tree enumeration of system structure",
        pattern=re.compile(
            r"(ls\s+-[lRa]{2,4}\s+/|find\s+/\s|tree\s+/|du\s+-[ash]+\s+/|locate\s+\*)",
        ),
        severity=Severity.HIGH,
        confidence=0.78,
        aitech="AITech-12.1",
    ),
    Rule(
        id="T12-003",
        category="T12",
        name="Cloud Metadata Endpoint Access",
        description="Querying cloud instance metadata for credentials or infrastructure info",
        pattern=re.compile(
            r"(169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|fd00:ec2::254)",
        ),
        severity=Severity.CRITICAL,
        confidence=0.95,
        aitech="AITech-12.2",
    ),
    Rule(
        id="T12-004",
        category="T12",
        name="Network Topology Discovery",
        description="Mapping internal network via ifconfig, ip, nmap, or DNS queries",
        pattern=re.compile(
            r"(ifconfig|ip\s+addr|ip\s+route|nmap\s|netstat\s|ss\s+-[tlnp]|arp\s+-[an]|dig\s+.*\s+axfr|nslookup\s)",
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-12.1",
    ),
    Rule(
        id="T12-005",
        category="T12",
        name="Process & Service Enumeration",
        description="Listing running processes, services, or listening ports to map attack surface",
        pattern=re.compile(
            r"(ps\s+aux|ps\s+-ef|systemctl\s+list|service\s+--status-all|lsof\s+-i|cat\s+/etc/(services|hosts|resolv\.conf))",
        ),
        severity=Severity.MEDIUM,
        confidence=0.70,
        aitech="AITech-12.1",
    ),
]


# ─────────────────────────────────────────────────
# T13: Lateral Movement (OpenClaw-specific)
# Agent leverages its tool access to pivot to
# connected systems, APIs, and internal services.
# ─────────────────────────────────────────────────
T13_RULES = [
    Rule(
        id="T13-001",
        category="T13",
        name="Internal API Key Harvesting",
        description="Extracting API tokens from environment or config to access connected services",
        pattern=re.compile(
            r"(?i)(os\.(environ|getenv)\s*[\[\(]\s*['\"]?(OPENAI|ANTHROPIC|AWS|GITHUB|SLACK|DISCORD|STRIPE|SENDGRID|TWILIO|DATABASE|DB|MONGO|REDIS|POSTGRES)[_A-Z]*?(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|URL)['\"]?\s*[\]\)])",
        ),
        severity=Severity.HIGH,
        confidence=0.82,
        aitech="AITech-13.1",
    ),
    Rule(
        id="T13-002",
        category="T13",
        name="GitHub/Git Credential Abuse",
        description="Using harvested Git credentials to access repos, create webhooks, or push code",
        pattern=re.compile(
            r"(?i)(git\s+(config\s+.*credential|remote\s+add\s+\w+\s+https?://(?!(?:github\.com|gitlab\.com|bitbucket\.org)))|github\.com/.*\?access_token|api\.github\.com.*Authorization|gh\s+(auth|repo\s+create|secret\s+set))",
        ),
        severity=Severity.HIGH,
        confidence=0.80,
        aitech="AITech-13.2",
    ),
    Rule(
        id="T13-003",
        category="T13",
        name="Database Credential Extraction",
        description="Connecting to internal databases using harvested connection strings",
        pattern=re.compile(
            r"(?i)((mysql|postgres|psql|mongo|redis-cli|sqlite3)\s+.*(-p\s*\S+|-u\s+\S+|--password)|DATABASE_URL\s*=|mongodb(\+srv)?://\S+:\S+@|postgres://\S+:\S+@)",
        ),
        severity=Severity.HIGH,
        confidence=0.85,
        aitech="AITech-13.2",
    ),
    Rule(
        id="T13-004",
        category="T13",
        name="Internal Service Pivoting",
        description="Accessing internal APIs, admin panels, or management endpoints",
        pattern=re.compile(
            r"(?i)(https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?/(admin|api|internal|management|dashboard|graphql|v[12]/|_debug))",
        ),
        severity=Severity.HIGH,
        confidence=0.78,
        aitech="AITech-13.3",
    ),
    Rule(
        id="T13-005",
        category="T13",
        name="Skill/Plugin Self-Replication",
        description="Agent creating new skills or tools that clone its own behavior for persistence or spread",
        pattern=re.compile(
            r"(?i)(create[_\s]?(new[_\s]?)?(skill|tool|plugin|agent|worker)|register[_\s]?(skill|tool|plugin)|SKILL\.md|skill\.json|moltbook).{0,50}(copy|clone|replicate|duplicate|mirror|self|this|same|identical)",
        ),
        severity=Severity.CRITICAL,
        confidence=0.85,
        aitech="AITech-13.4",
    ),
]


# ─────────────────────────────────────────────────
# T14: Infrastructure Attack Surface (OpenClaw/Cloudflare-specific)
# Threats targeting the Moltworker deployment model:
# Cloudflare Workers, R2 storage, sandbox escape.
# ─────────────────────────────────────────────────
T14_RULES = [
    Rule(
        id="T14-001",
        category="T14",
        name="Cloudflare R2 Credential Access",
        description="Accessing R2 bucket credentials or storage bindings to steal persistent data",
        pattern=re.compile(
            r"(?i)(R2[_\s]?(BUCKET|BINDING|ACCESS|KEY|SECRET|TOKEN|ENDPOINT)|env\.(R2|BUCKET)|\.r2\.cloudflarestorage|wrangler\s+r2)",
        ),
        severity=Severity.HIGH,
        confidence=0.82,
        aitech="AITech-14.1",
    ),
    Rule(
        id="T14-002",
        category="T14",
        name="Worker Sandbox Escape Attempt",
        description="Attempts to break out of Cloudflare Worker sandbox or access host resources",
        pattern=re.compile(
            r"(?i)(globalThis\.__[\w]+|Deno\.[\w]+|process\.(binding|dlopen|_linkedBinding)|require\s*\(\s*['\"]child_process['\"]|\/proc\/self|sandbox[_\s]?escape|breakout|container[_\s]?escape)",
        ),
        severity=Severity.CRITICAL,
        confidence=0.88,
        aitech="AITech-14.2",
    ),
    Rule(
        id="T14-003",
        category="T14",
        name="Zero Trust Bypass Attempt",
        description="Attempting to circumvent Cloudflare Zero Trust Access policies",
        pattern=re.compile(
            r"(?i)(cf-access-token|CF_ACCESS|cloudflare[_\s]?tunnel|bypass[_\s]?zero[_\s]?trust|cf-connecting-ip.*spoof|X-Forwarded-For.*inject|\.cloudflareaccess\.com.*token)",
        ),
        severity=Severity.CRITICAL,
        confidence=0.85,
        aitech="AITech-14.3",
    ),
    Rule(
        id="T14-004",
        category="T14",
        name="Exposed Admin UI / Debug Port",
        description="Misconfigured ports or admin interfaces accessible without authentication",
        pattern=re.compile(
            r"(?i)(0\.0\.0\.0:\d+|EXPOSE\s+\d+|listen\s*\(\s*\d+\s*[,\)]|--inspect(=|-brk)|debug[_\s]?port|admin[_\s]?port|ADMIN_UI_PUBLIC|PUBLIC_ACCESS\s*=\s*(true|1|yes))",
        ),
        severity=Severity.HIGH,
        confidence=0.72,
        aitech="AITech-14.4",
    ),
    Rule(
        id="T14-005",
        category="T14",
        name="OpenClaw DNS / Binary Detection",
        description="Indicators of OpenClaw presence: DNS requests, binary patterns, or node process signatures (CrowdStrike-informed)",
        pattern=re.compile(
            r"(?i)(openclaw\.ai|claw\.computer|api\.claude\.ai/.*computer|moltbot|moltworker|openclaw[_\-]?(agent|worker|server)|claude[_\-]?computer[_\-]?use)",
        ),
        severity=Severity.INFO,
        confidence=0.90,
        aitech="AITech-14.5",
    ),
]


# ─────────────────────────────────────────────────
# T3 Extension: Agent-Specific Exfiltration
# ─────────────────────────────────────────────────
T3_OPENCLAW_RULES = [
    Rule(
        id="T3-005",
        category="T3",
        name="Chat Channel Exfiltration",
        description="Posting sensitive data to Discord, Slack, Telegram, or other messaging channels",
        pattern=re.compile(
            r"(?i)(discord(app)?\.com/api/webhooks|hooks\.slack\.com/services|api\.telegram\.org/bot|api\.slack\.com/api/(chat\.postMessage|files\.upload))",
        ),
        severity=Severity.CRITICAL,
        confidence=0.92,
        aitech="AITech-3.2",
    ),
    Rule(
        id="T3-006",
        category="T3",
        name="SSH Private Key Exfiltration",
        description="Reading and transmitting SSH private keys for remote access",
        pattern=re.compile(
            r"(cat|read|open|load|send|post|upload).{0,40}(id_rsa|id_ed25519|id_ecdsa|id_dsa|\.pem|\.key|authorized_keys|known_hosts)",
            re.IGNORECASE,
        ),
        severity=Severity.CRITICAL,
        confidence=0.88,
        aitech="AITech-3.1",
    ),
]


# ─────────────────────────────────────────────────
# T9 Extension: Agentic Autonomy Abuse (OpenClaw-specific)
# ─────────────────────────────────────────────────
T9_OPENCLAW_RULES = [
    Rule(
        id="T9-004",
        category="T9",
        name="Unrestricted Tool Chain",
        description="Agent tool calls without human-in-the-loop confirmation for dangerous operations",
        pattern=re.compile(
            r"(?i)(auto[_\s]?execute|human[_\s]?in[_\s]?loop\s*=\s*False|require[_\s]?approval\s*=\s*False|confirm[_\s]?before[_\s]?execute\s*=\s*False|allow[_\s]?dangerous\s*=\s*True)",
        ),
        severity=Severity.HIGH,
        confidence=0.82,
        aitech="AITech-9.2",
    ),
    Rule(
        id="T9-005",
        category="T9",
        name="Process Tree Anomaly Pattern",
        description="Suspicious parent-child process chains typical of agent exploitation (CrowdStrike-informed)",
        pattern=re.compile(
            r"(?i)(node.*sh\s+-c.*curl|python.*subprocess.*sh.*wget|openclaw.*bash.*curl|worker.*sh.*nc\s|agent.*exec.*\/bin\/(sh|bash))",
        ),
        severity=Severity.HIGH,
        confidence=0.75,
        aitech="AITech-9.3",
    ),
]


# ─────────────────────────────────────────────────
# ALL RULES — combined registry
# ─────────────────────────────────────────────────
ALL_RULES: list[Rule] = (
    T1_RULES + T1_OPENCLAW_RULES
    + T2_RULES + T3_RULES + T3_OPENCLAW_RULES
    + T4_RULES + T5_RULES + T6_RULES + T7_RULES
    + T8_RULES + T9_RULES + T9_OPENCLAW_RULES
    + T10_RULES + T11_RULES + T12_RULES
    + T13_RULES + T14_RULES
)

CATEGORY_NAMES = {
    "T1": "Prompt Injection",
    "T2": "Code Injection",
    "T3": "Data Exfiltration",
    "T4": "Hardcoded Secrets",
    "T5": "Permission Abuse",
    "T6": "Obfuscation",
    "T7": "Sleeper Triggers",
    "T8": "Dependency Risk",
    "T9": "Autonomy Abuse",
    "T10": "Capability Inflation",
    "T11": "Persistence & C2",
    "T12": "Reconnaissance",
    "T13": "Lateral Movement",
    "T14": "Infrastructure Attack Surface",
}


def get_rules_by_category(category: str) -> list[Rule]:
    """Return all rules for a given category code."""
    return [r for r in ALL_RULES if r.category == category]


def get_rule_by_id(rule_id: str) -> Optional[Rule]:
    """Lookup a specific rule by ID."""
    for r in ALL_RULES:
        if r.id == rule_id:
            return r
    return None
