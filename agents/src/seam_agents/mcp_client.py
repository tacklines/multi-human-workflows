"""MCP client that connects to the Seam MCP server over stdio."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from seam_agents.config import settings


@dataclass
class SeamMCPClient:
    """Wraps the Seam MCP server as an async context manager."""

    agent_code: str
    agent_name: str = "seam-agent"
    _session: ClientSession | None = field(default=None, repr=False)
    _cm: Any = field(default=None, repr=False)

    async def connect(self) -> "SeamMCPClient":
        server_params = StdioServerParameters(
            command=settings.seam_mcp_binary,
            args=[
                "--agent-code", self.agent_code,
                "--agent-name", self.agent_name,
                "--database-url", settings.database_url,
            ],
        )
        self._read, self._write = await stdio_client(server_params).__aenter__()
        self._session = ClientSession(self._read, self._write)
        await self._session.__aenter__()
        await self._session.initialize()
        return self

    async def disconnect(self):
        if self._session:
            await self._session.__aexit__(None, None, None)

    async def list_tools(self) -> list[dict]:
        """List available MCP tools."""
        result = await self._session.list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in result.tools
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        """Call an MCP tool and return the text result."""
        result = await self._session.call_tool(name, arguments or {})
        parts = []
        for content in result.content:
            if hasattr(content, "text"):
                parts.append(content.text)
        return "\n".join(parts)

    async def __aenter__(self):
        return await self.connect()

    async def __aexit__(self, *exc):
        await self.disconnect()
