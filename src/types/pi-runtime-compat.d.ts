declare module "@earendil-works/pi-agent-core" {
	interface AgentToolResult<T> {
		/** Runtime error flag carried by Pi's tool execution/rendering path. */
		isError?: boolean;
	}
}

export {};
