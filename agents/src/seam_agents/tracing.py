"""Langfuse tracing integration for LangChain/LangGraph."""

from langfuse.langchain import CallbackHandler

from seam_agents.config import settings


def get_langfuse_handler(**kwargs) -> CallbackHandler | None:
    """Return a Langfuse callback handler if credentials are configured."""
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None
    return CallbackHandler(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
        **kwargs,
    )
