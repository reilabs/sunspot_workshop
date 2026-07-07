// Runs at import time — must be imported before any module that reads
// `globalThis.Buffer` at its own module-init.
// A separate file is required: if this lived at the top of main.ts, ES
// module hoisting would evaluate main.ts's other imports first.
import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
