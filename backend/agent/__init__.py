"""M3 Agent investigator powered by OpenRouter perplexity/pplx-decider-flash-v1.3:free."""
from .investigator import investigate_incident
from .llm import DeciderGateway

__all__ = ["investigate_incident", "DeciderGateway"]
