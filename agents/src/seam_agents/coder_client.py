"""MCP client that connects to the Coder MCP server for workspace management.

Uses a dedicated background thread for the async event loop, same pattern
as SeamMCPClient.
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from seam_agents.config import settings


@dataclass
class CoderMCPClient:
    """Wraps the Coder MCP server (coder exp mcp server) with a background event loop."""

    _session: ClientSession | None = field(default=None, repr=False)
    _stdio_cm: Any = field(default=None, repr=False)
    _loop: asyncio.AbstractEventLoop | None = field(default=None, repr=False)
    _thread: threading.Thread | None = field(default=None, repr=False)

    def _start_loop(self):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever,
            daemon=True,
            name="coder-mcp-event-loop",
        )
        self._thread.start()

    def _run(self, coro) -> Any:
        if self._loop is None:
            raise RuntimeError("Background loop not started")
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    def connect(self) -> "CoderMCPClient":
        self._start_loop()
        self._run(self._async_connect())
        return self

    async def _async_connect(self):
        server_params = StdioServerParameters(
            command=settings.coder_binary,
            args=["exp", "mcp", "server"],
            env={
                "CODER_URL": settings.coder_url,
                "CODER_SESSION_TOKEN": settings.coder_session_token,
                "CODER_MCP_APP_STATUS_SLUG": "agent",
            },
        )
        self._stdio_cm = stdio_client(server_params)
        self._read, self._write = await self._stdio_cm.__aenter__()
        self._session = ClientSession(self._read, self._write)
        await self._session.__aenter__()
        await self._session.initialize()

    def disconnect(self):
        if self._loop is None:
            return
        try:
            self._run(self._async_disconnect())
        except RuntimeError:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=5)
        self._loop = None
        self._thread = None

    async def _async_disconnect(self):
        if self._session:
            await self._session.__aexit__(None, None, None)
            self._session = None
        if self._stdio_cm:
            await self._stdio_cm.__aexit__(None, None, None)
            self._stdio_cm = None

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("Not connected — call connect() first")
        return self._session

    def list_tools(self) -> list[dict]:
        return self._run(self._async_list_tools())

    async def _async_list_tools(self) -> list[dict]:
        result = await self._require_session().list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in result.tools
        ]

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        return self._run(self._async_call_tool(name, arguments))

    async def _async_call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        result = await self._require_session().call_tool(name, arguments or {})
        parts = []
        for content in result.content:
            if hasattr(content, "text"):
                parts.append(content.text)
        return "\n".join(parts)
