import os

from dotenv import load_dotenv

load_dotenv()


class AriaConfig:
    def __init__(self) -> None:
        self.mode = os.getenv("ARIA_MODE", "mock")
        self.aws_region = os.getenv("AWS_REGION", "us-east-1")
        self.bedrock_model_id = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
        self.copilot_model_id = os.getenv("COPILOT_BEDROCK_MODEL", self.bedrock_model_id)
        self.datadog_api_key = os.getenv("DATADOG_API_KEY")
        self.datadog_app_key = os.getenv("DATADOG_APP_KEY")
        self.datadog_site = os.getenv("DATADOG_SITE", "datadoghq.com")
        self.neo4j_uri = os.getenv("NEO4J_URI")
        self.neo4j_username = os.getenv("NEO4J_USERNAME", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD")
        self.neo4j_database = os.getenv("NEO4J_DATABASE", "neo4j")
        self.mongodb_uri = os.getenv("MONGODB_URI")
        self.bedrock_api_key = os.getenv("BEDROCK_API_KEY")  # AgentCore bearer token
        self.port = int(os.getenv("ARIA_BACKEND_PORT", "4000"))
        self.cors_origins = [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
            if o.strip()
        ]

    @property
    def is_live(self) -> bool:
        return self.mode == "live"

    def connector_live(self, name: str) -> bool:
        if not self.is_live:
            return False
        checks: dict[str, bool] = {
            "datadog": bool(self.datadog_api_key and self.datadog_app_key),
            "bedrock": bool(self.aws_region and self.bedrock_model_id),
            "neo4j": bool(self.neo4j_uri and self.neo4j_password),
            "mongodb": bool(self.mongodb_uri),
        }
        return checks.get(name, False)


config = AriaConfig()
