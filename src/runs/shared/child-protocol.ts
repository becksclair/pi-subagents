export interface ProtocolOutputLimit {
	code: "protocol_output_limit";
	stream: "stdout" | "stderr";
	limitBytes: number;
	observedBytes: number;
}

export const MAX_CHILD_PENDING_LINE_BYTES = 16 * 1024 * 1024;
export const MAX_CHILD_STDERR_BYTES = 128 * 1024;

export function formatProtocolOutputLimit(limit: ProtocolOutputLimit): string {
	return `${limit.code}: child ${limit.stream} line exceeded ${limit.limitBytes} bytes (observed at least ${limit.observedBytes} bytes without a newline).`;
}

export function createBoundedByteTail(maxBytes = MAX_CHILD_STDERR_BYTES): {
	push(chunk: Buffer | string): void;
	text(): string;
} {
	let tail: Buffer<ArrayBufferLike> = Buffer.alloc(0);
	return {
		push(chunk) {
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			if (bytes.length >= maxBytes) {
				tail = bytes.subarray(bytes.length - maxBytes);
				return;
			}
			if (tail.length + bytes.length <= maxBytes) {
				tail = Buffer.concat([tail, bytes]);
				return;
			}
			const keep = Math.max(0, maxBytes - bytes.length);
			tail = Buffer.concat([tail.subarray(Math.max(0, tail.length - keep)), bytes]);
		},
		text() {
			return tail.toString("utf8");
		},
	};
}

export function createBoundedLineReader(options: {
	stream?: "stdout" | "stderr";
	maxPendingLineBytes?: number;
	onLine: (line: string) => void;
	onLimit: (limit: ProtocolOutputLimit) => void;
}): {
	push(chunk: Buffer | string): void;
	end(): void;
	exceeded(): boolean;
} {
	const maxPendingLineBytes = options.maxPendingLineBytes ?? MAX_CHILD_PENDING_LINE_BYTES;
	let pending: Buffer[] = [];
	let pendingBytes = 0;
	let limitExceeded = false;

	const append = (segment: Buffer): boolean => {
		if (segment.length === 0) return true;
		const observedBytes = pendingBytes + segment.length;
		if (observedBytes > maxPendingLineBytes) {
			limitExceeded = true;
			pending = [];
			pendingBytes = 0;
			options.onLimit({
				code: "protocol_output_limit",
				stream: options.stream ?? "stdout",
				limitBytes: maxPendingLineBytes,
				observedBytes,
			});
			return false;
		}
		pending.push(segment);
		pendingBytes = observedBytes;
		return true;
	};

	const emitPending = (): void => {
		if (pendingBytes === 0) return;
		options.onLine(Buffer.concat(pending, pendingBytes).toString("utf8"));
		pending = [];
		pendingBytes = 0;
	};

	return {
		push(chunk) {
			if (limitExceeded) return;
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			let start = 0;
			for (let index = 0; index < bytes.length; index++) {
				if (bytes[index] !== 0x0a) continue;
				if (!append(bytes.subarray(start, index))) return;
				emitPending();
				start = index + 1;
			}
			append(bytes.subarray(start));
		},
		end() {
			if (!limitExceeded) emitPending();
		},
		exceeded: () => limitExceeded,
	};
}
