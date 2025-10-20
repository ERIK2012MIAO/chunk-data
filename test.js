import {Readable} from 'node:stream';
import {
	equal,
	deepEqual,
	ok,
	throws,
	rejects,
} from 'node:assert/strict';
import test from 'node:test';
import {chunk, chunkFrom, chunkFromAsync} from './index.js';

// Helper to collect all chunks from a generator
function collectChunks(generator) {
	return [...generator];
}

// Helper to collect all chunks from an async generator
async function collectAsyncChunks(asyncGenerator) {
	const chunks = [];
	for await (const chunk of asyncGenerator) {
		chunks.push(chunk);
	}

	return chunks;
}

test('chunk - splits Uint8Array into default 64KB chunks', () => {
	const buffer = new Uint8Array(200_000);
	const chunks = collectChunks(chunk(buffer, 65_536));

	equal(chunks.length, 4);
	equal(chunks[0].length, 65_536);
	equal(chunks[1].length, 65_536);
	equal(chunks[2].length, 65_536);
	equal(chunks[3].length, 3392); // Remainder
});

test('chunk - splits Uint8Array with custom chunk size', () => {
	const buffer = new Uint8Array(300_000);
	const chunks = collectChunks(chunk(buffer, 100_000));

	equal(chunks.length, 3);
	equal(chunks[0].length, 100_000);
	equal(chunks[1].length, 100_000);
	equal(chunks[2].length, 100_000);
});

test('chunk - handles exact multiple of chunk size', () => {
	const buffer = new Uint8Array(196_608); // Exactly 3 * 65536
	const chunks = collectChunks(chunk(buffer, 65_536));

	equal(chunks.length, 3);
	equal(chunks[0].length, 65_536);
	equal(chunks[1].length, 65_536);
	equal(chunks[2].length, 65_536);
});

test('chunk - handles buffer smaller than chunk size', () => {
	const buffer = new Uint8Array(1000);
	const chunks = collectChunks(chunk(buffer, 65_536));

	equal(chunks.length, 1);
	equal(chunks[0].length, 1000);
});

test('chunk - handles empty buffer', () => {
	const buffer = new Uint8Array(0);
	const chunks = collectChunks(chunk(buffer, 65_536));

	equal(chunks.length, 0);
});

test('chunk - preserves data integrity', () => {
	const buffer = new Uint8Array(1000);
	// Fill with sequential values
	for (let index = 0; index < buffer.length; index++) {
		buffer[index] = index % 256;
	}

	const chunks = collectChunks(chunk(buffer, 300));

	// Reconstruct the buffer from chunks
	const reconstructed = new Uint8Array(1000);
	let offset = 0;
	for (const chunk of chunks) {
		reconstructed.set(chunk, offset);
		offset += chunk.length;
	}

	deepEqual(reconstructed, buffer);
});

test('chunk - works with Uint16Array', () => {
	const buffer = new Uint16Array(1000);
	const chunks = collectChunks(chunk(buffer, 1000));

	// Uint16Array has 2 bytes per element, so 1000 elements = 2000 bytes
	equal(chunks.length, 2);
	equal(chunks[0].length, 1000);
	equal(chunks[1].length, 1000);
});

test('chunk - works with Int32Array', () => {
	const buffer = new Int32Array(500);
	const chunks = collectChunks(chunk(buffer, 1000));

	// Int32Array has 4 bytes per element, so 500 elements = 2000 bytes
	equal(chunks.length, 2);
	equal(chunks[0].length, 1000);
	equal(chunks[1].length, 1000);
});

test('chunk - chunks are views of original buffer', () => {
	const buffer = new Uint8Array(1000);
	buffer[0] = 42;
	buffer[999] = 99;

	const chunks = collectChunks(chunk(buffer, 300));

	equal(chunks[0][0], 42);
	equal(chunks.at(-1)[99], 99); // Last chunk, offset 99
});

test('chunk - throws on non-ArrayBufferView input', () => {
	throws(() => {
		collectChunks(chunk('not a buffer', 65_536));
	}, {
		name: 'TypeError',
		message: 'Expected data to be ArrayBufferView',
	});

	throws(() => {
		collectChunks(chunk([1, 2, 3], 65_536));
	}, {
		name: 'TypeError',
		message: 'Expected data to be ArrayBufferView',
	});

	throws(() => {
		collectChunks(chunk(undefined, 65_536));
	}, {
		name: 'TypeError',
		message: 'Expected data to be ArrayBufferView',
	});
});

test('chunk - throws on invalid chunk size', () => {
	const buffer = new Uint8Array(100);
	const error = {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	};

	throws(() => {
		collectChunks(chunk(buffer, 0));
	}, error);

	throws(() => {
		collectChunks(chunk(buffer, -1));
	}, error);

	throws(() => {
		collectChunks(chunk(buffer, 1.5));
	}, error);

	throws(() => {
		collectChunks(chunk(buffer, 'invalid'));
	}, error);
});

test('chunk - validates parameters in order', () => {
	// When both parameters are invalid, should throw error for first parameter (data)
	throws(() => {
		collectChunks(chunk(null, -1));
	}, {
		name: 'TypeError',
		message: 'Expected data to be ArrayBufferView',
	});
});

test('chunkFromAsync - splits stream chunks into smaller pieces', async () => {
	const buffer = new Uint8Array(200_000);
	const stream = Readable.from([buffer]);
	const chunks = await collectAsyncChunks(chunkFromAsync(stream, 65_536));

	// Readable.from emits the whole buffer as one chunk, which gets split
	ok(chunks.length > 1);
	equal(chunks[0].length, 65_536);
	equal(chunks.at(-1).length, 200_000 % 65_536);

	// Verify total size
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 200_000);
});

test('chunkFromAsync - works with custom chunk size', async () => {
	const buffer = new Uint8Array(300_000);
	const stream = Readable.from([buffer]);
	const chunks = await collectAsyncChunks(chunkFromAsync(stream, 100_000));

	equal(chunks.length, 3);
	equal(chunks[0].length, 100_000);
	equal(chunks[1].length, 100_000);
	equal(chunks[2].length, 100_000);
});

test('chunkFromAsync - preserves data integrity', async () => {
	const buffer = new Uint8Array(10_000);
	// Fill with sequential values
	for (let index = 0; index < buffer.length; index++) {
		buffer[index] = index % 256;
	}

	const stream = Readable.from([buffer]);
	const chunks = await collectAsyncChunks(chunkFromAsync(stream, 3000));

	// Reconstruct the buffer from chunks
	const reconstructed = new Uint8Array(10_000);
	let offset = 0;
	for (const chunk of chunks) {
		reconstructed.set(chunk, offset);
		offset += chunk.length;
	}

	deepEqual(reconstructed, buffer);
});

test('chunkFromAsync - handles empty stream', async () => {
	const buffer = new Uint8Array(0);
	const stream = Readable.from([buffer]);
	const chunks = await collectAsyncChunks(chunkFromAsync(stream, 65_536));

	equal(chunks.length, 0);
});

test('chunkFromAsync - works with stream that emits multiple chunks', async () => {
	// Create a stream that emits multiple chunks
	async function * multiChunkGenerator() {
		yield new Uint8Array(100_000);
		yield new Uint8Array(100_000);
		yield new Uint8Array(100_000);
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(multiChunkGenerator(), 50_000));

	// Each 100KB chunk gets split into 2 50KB chunks = 6 total
	equal(chunks.length, 6);
	for (const chunk of chunks) {
		equal(chunk.length, 50_000);
	}
});

test('chunkFromAsync - works with sync iterable', async () => {
	function * syncGenerator() {
		yield new Uint8Array(100_000);
		yield new Uint8Array(50_000);
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(syncGenerator(), 40_000));

	ok(chunks.length > 1);
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 150_000);
});

test('chunkFromAsync - handles Uint16Array chunks', async () => {
	async function * typedArrayGenerator() {
		yield new Uint16Array(500); // 1000 bytes
		yield new Uint16Array(500); // 1000 bytes
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(typedArrayGenerator(), 500));

	equal(chunks.length, 4);
	for (const chunk of chunks) {
		equal(chunk.length, 500);
	}
});

test('chunkFromAsync - throws on non-iterable input', async () => {
	await rejects(async () => {
		for await (const _ of chunkFromAsync(null, 65_536)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an async iterable or iterable',
	});

	await rejects(async () => {
		for await (const _ of chunkFromAsync(123, 65_536)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an async iterable or iterable',
	});

	await rejects(async () => {
		for await (const _ of chunkFromAsync({}, 65_536)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an async iterable or iterable',
	});
});

test('chunkFromAsync - throws on invalid chunk size', async () => {
	const stream = Readable.from(new Uint8Array(100));

	await rejects(async () => {
		for await (const _ of chunkFromAsync(stream, 0)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});

	await rejects(async () => {
		for await (const _ of chunkFromAsync(stream, -1)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunkFromAsync - throws on non-TypedArray iterable chunks', async () => {
	async function * invalidGenerator() {
		yield 'not a buffer';
	}

	await rejects(async () => {
		for await (const _ of chunkFromAsync(invalidGenerator(), 65_536)) {
			// Should throw when processing first chunk
		}
	}, {
		name: 'TypeError',
		message: 'Expected iterable chunks to be Uint8Array or ArrayBufferView',
	});
});

test('chunkFromAsync - handles large files efficiently', async () => {
	// Simulate a 10MB file
	const largeBuffer = new Uint8Array(10_000_000);
	const stream = Readable.from([largeBuffer]);
	const chunks = await collectAsyncChunks(chunkFromAsync(stream, 65_536));

	// Verify we got proper chunking
	ok(chunks.length > 100); // Should have many chunks
	ok(chunks.every(chunk => chunk.length <= 65_536)); // All chunks <= 64KB

	// Verify total size
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 10_000_000);
});

test('chunkFromAsync - accumulates small chunks to reach desired size', async () => {
	// Stream emits multiple small chunks that need accumulation
	async function * smallChunkGenerator() {
		yield new Uint8Array(300); // 300 bytes
		yield new Uint8Array(300); // 300 bytes
		yield new Uint8Array(300); // 300 bytes
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(smallChunkGenerator(), 500));

	// First two 300-byte chunks should combine into one 500-byte chunk (with 100 left over)
	// Third 300-byte chunk combines with leftover 100 to make 400 bytes
	equal(chunks.length, 2);
	equal(chunks[0].length, 500);
	equal(chunks[1].length, 400);

	// Verify total size
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 900);
});

test('chunkFromAsync - handles exact chunk size from single emit', async () => {
	async function * exactGenerator() {
		yield new Uint8Array(1000);
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(exactGenerator(), 1000));

	equal(chunks.length, 1);
	equal(chunks[0].length, 1000);
});

test('chunk - handles exact chunk size', () => {
	const buffer = new Uint8Array(1000);
	const chunks = collectChunks(chunk(buffer, 1000));

	equal(chunks.length, 1);
	equal(chunks[0].length, 1000);
});

test('chunk - works with TypedArray view with offset', () => {
	// Create a buffer with offset and limited length
	const arrayBuffer = new ArrayBuffer(1000);
	const view = new Uint16Array(arrayBuffer, 100, 200); // 200 elements starting at byte 100 = 400 bytes

	// Fill with test data
	for (let index = 0; index < view.length; index++) {
		view[index] = index;
	}

	const chunks = collectChunks(chunk(view, 150));

	// 400 bytes total, 150 byte chunks
	equal(chunks.length, 3);
	equal(chunks[0].length, 150);
	equal(chunks[1].length, 150);
	equal(chunks[2].length, 100);

	// Verify total size
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 400);
});

test('chunkFromAsync - works with TypedArray view with offset', async () => {
	const arrayBuffer = new ArrayBuffer(1000);
	const view = new Uint16Array(arrayBuffer, 100, 200); // 400 bytes

	for (let index = 0; index < view.length; index++) {
		view[index] = index;
	}

	async function * viewGenerator() {
		yield view;
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(viewGenerator(), 150));

	equal(chunks.length, 3);
	equal(chunks[0].length, 150);
	equal(chunks[1].length, 150);
	equal(chunks[2].length, 100);
});

test('chunkFromAsync - handles mixed small and large chunks', async () => {
	async function * mixedGenerator() {
		yield new Uint8Array(100); // Small
		yield new Uint8Array(200); // Small
		yield new Uint8Array(800); // Large - will split
		yield new Uint8Array(150); // Small
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(mixedGenerator(), 500));

	// 100 + 200 = 300 (need more)
	// 300 + 800 = 1100 -> emit 500, keep 600
	// 600 -> emit 500, keep 100
	// 100 + 150 = 250 (final chunk)
	equal(chunks.length, 3);
	equal(chunks[0].length, 500);
	equal(chunks[1].length, 500);
	equal(chunks[2].length, 250);

	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 1250);
});

test('chunk - handles chunkSize of 1', () => {
	const buffer = new Uint8Array(10);
	for (let index = 0; index < buffer.length; index++) {
		buffer[index] = index;
	}

	const chunks = collectChunks(chunk(buffer, 1));

	equal(chunks.length, 10);
	for (const [index, chunk] of chunks.entries()) {
		equal(chunk.length, 1);
		equal(chunk[0], index);
	}
});

// ChunkFrom tests
test('chunkFrom - works with iterable of buffers', () => {
	const buffers = [new Uint8Array(1000), new Uint8Array(2000)];
	const chunks = collectChunks(chunkFrom(buffers, 500));

	// 1000 + 2000 = 3000 bytes total, split into 500-byte chunks
	equal(chunks.length, 6);
	for (const chunk of chunks) {
		equal(chunk.length, 500);
	}
});

test('chunkFrom - accumulates small chunks', () => {
	const buffers = [new Uint8Array(300), new Uint8Array(300), new Uint8Array(300)];
	const chunks = collectChunks(chunkFrom(buffers, 500));

	// 300 + 300 = 600 -> emit 500, keep 100
	// 100 + 300 = 400 -> final chunk
	equal(chunks.length, 2);
	equal(chunks[0].length, 500);
	equal(chunks[1].length, 400);
});

test('chunkFrom - handles mixed small and large chunks', () => {
	const buffers = [new Uint8Array(100), new Uint8Array(800), new Uint8Array(150)];
	const chunks = collectChunks(chunkFrom(buffers, 500));

	// 100 + 800 = 900 -> emit 500, keep 400
	// 400 + 150 = 550 -> emit 500, keep 50
	// 50 -> final chunk
	equal(chunks.length, 3);
	equal(chunks[0].length, 500);
	equal(chunks[1].length, 500);
	equal(chunks[2].length, 50);
});

test('chunkFrom - preserves data integrity', () => {
	const buffer1 = new Uint8Array(500);
	const buffer2 = new Uint8Array(500);

	for (let index = 0; index < buffer1.length; index++) {
		buffer1[index] = index % 256;
	}

	for (let index = 0; index < buffer2.length; index++) {
		buffer2[index] = (index + 128) % 256;
	}

	const chunks = collectChunks(chunkFrom([buffer1, buffer2], 300));

	// Reconstruct
	const reconstructed = new Uint8Array(1000);
	let offset = 0;
	for (const chunk of chunks) {
		reconstructed.set(chunk, offset);
		offset += chunk.length;
	}

	deepEqual(reconstructed.subarray(0, 500), buffer1);
	deepEqual(reconstructed.subarray(500, 1000), buffer2);
});

test('chunkFrom - works with generator', () => {
	function * bufferGenerator() {
		yield new Uint8Array(100);
		yield new Uint8Array(200);
		yield new Uint8Array(300);
	}

	const chunks = collectChunks(chunkFrom(bufferGenerator(), 250));

	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 600);
});

test('chunkFrom - throws on non-iterable input', () => {
	throws(() => {
		collectChunks(chunkFrom('not iterable', 100));
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an Iterable<ArrayBufferView>',
	});

	throws(() => {
		collectChunks(chunkFrom(123, 100));
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an Iterable<ArrayBufferView>',
	});
});

test('chunkFrom - throws on non-buffer chunks', () => {
	throws(() => {
		collectChunks(chunkFrom(['not a buffer'], 100));
	}, {
		name: 'TypeError',
		message: 'Expected iterable chunks to be Uint8Array or ArrayBufferView',
	});
});

test('chunkFrom - handles empty iterable', () => {
	const chunks = collectChunks(chunkFrom([], 100));
	equal(chunks.length, 0);
});

test('chunkFrom - validates parameters in order', () => {
	// When both parameters are invalid, should throw error for first parameter (iterable)
	throws(() => {
		collectChunks(chunkFrom(null, -1));
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an Iterable<ArrayBufferView>',
	});
});

test('chunkFrom - works with TypedArray views', () => {
	const buffers = [new Uint16Array(250), new Int32Array(125)];
	const chunks = collectChunks(chunkFrom(buffers, 300));

	// Uint16Array: 250 elements * 2 bytes = 500 bytes
	// Int32Array: 125 elements * 4 bytes = 500 bytes
	// Total: 1000 bytes -> 3 chunks (300, 300, 300, 100)
	equal(chunks.length, 4);
	equal(chunks[0].length, 300);
	equal(chunks[1].length, 300);
	equal(chunks[2].length, 300);
	equal(chunks[3].length, 100);
});

test('chunkFromAsync - handles very large chunkSize', async () => {
	async function * generator() {
		yield new Uint8Array(100);
		yield new Uint8Array(200);
		yield new Uint8Array(300);
	}

	// ChunkSize much larger than total data
	const chunks = await collectAsyncChunks(chunkFromAsync(generator(), 1_000_000));

	// Should accumulate everything into one chunk
	equal(chunks.length, 1);
	equal(chunks[0].length, 600);
});

test('chunk - works with DataView input', () => {
	const arrayBuffer = new ArrayBuffer(1000);
	const dataView = new DataView(arrayBuffer, 100, 500); // 500 bytes starting at byte 100
	const chunks = collectChunks(chunk(dataView, 200));

	equal(chunks.length, 3);
	equal(chunks[0].length, 200);
	equal(chunks[1].length, 200);
	equal(chunks[2].length, 100);

	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 500);
});

test('chunkFromAsync - works with DataView input', async () => {
	const arrayBuffer = new ArrayBuffer(1000);
	const dataView = new DataView(arrayBuffer, 100, 500);

	async function * dataViewGenerator() {
		yield dataView;
	}

	const chunks = await collectAsyncChunks(chunkFromAsync(dataViewGenerator(), 200));

	equal(chunks.length, 3);
	equal(chunks[0].length, 200);
	equal(chunks[1].length, 200);
	equal(chunks[2].length, 100);
});

test('chunk - yields views that reflect mutations to original buffer', () => {
	const buffer = new Uint8Array(100);
	buffer[0] = 42;
	buffer[50] = 99;
	buffer[99] = 123;

	const chunks = collectChunks(chunk(buffer, 40));

	// Chunks are views, so they should reflect the original buffer values
	equal(chunks[0][0], 42);
	equal(chunks[1][10], 99); // Index 50 in original is index 10 in second chunk (40-80)
	equal(chunks[2][19], 123); // Index 99 in original is index 19 in third chunk (80-100)

	// Mutating the original buffer should reflect in the chunks
	buffer[0] = 255;
	equal(chunks[0][0], 255);
});

test('chunk - throws on NaN chunkSize', () => {
	const buffer = new Uint8Array(100);
	throws(() => {
		collectChunks(chunk(buffer, Number.NaN));
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunk - throws on Infinity chunkSize', () => {
	const buffer = new Uint8Array(100);
	throws(() => {
		collectChunks(chunk(buffer, Number.POSITIVE_INFINITY));
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunk - throws on unsafe integer chunkSize', () => {
	const buffer = new Uint8Array(100);
	throws(() => {
		collectChunks(chunk(buffer, Number.MAX_SAFE_INTEGER + 1));
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunkFromAsync - throws on NaN chunkSize', async () => {
	const stream = Readable.from([new Uint8Array(100)]);

	await rejects(async () => {
		for await (const _ of chunkFromAsync(stream, Number.NaN)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunkFromAsync - throws on Infinity chunkSize', async () => {
	const stream = Readable.from([new Uint8Array(100)]);

	await rejects(async () => {
		for await (const _ of chunkFromAsync(stream, Number.POSITIVE_INFINITY)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunkFromAsync - throws on unsafe integer chunkSize', async () => {
	const stream = Readable.from([new Uint8Array(100)]);

	await rejects(async () => {
		for await (const _ of chunkFromAsync(stream, Number.MAX_SAFE_INTEGER + 1)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected chunkSize to be a positive integer',
	});
});

test('chunkFromAsync - validates parameters in order', async () => {
	// When both parameters are invalid, should throw error for first parameter (iterable)
	await rejects(async () => {
		for await (const _ of chunkFromAsync(null, -1)) {
			// Should throw before entering loop
		}
	}, {
		name: 'TypeError',
		message: 'Expected iterable to be an async iterable or iterable',
	});
});

test('chunkFrom - handles many tiny chunks efficiently (avoids O(n²))', () => {
	// With fixed carry buffer, it should be fast
	function * manyTinyChunks() {
		// Emit 10,000 chunks of 1KB each = 10MB total
		// Target chunk size is 1MB, so all chunks accumulate before first emit
		for (let index = 0; index < 10_000; index++) {
			yield new Uint8Array(1024);
		}
	}

	const start = Date.now();
	const chunks = collectChunks(chunkFrom(manyTinyChunks(), 1024 * 1024));
	const duration = Date.now() - start;

	// Should complete in well under 1 second
	ok(duration < 1000, `Took ${duration}ms, expected < 1000ms`);

	// Verify correctness: 10MB total should produce 10 chunks of 1MB each
	equal(chunks.length, 10);
	equal(chunks[0].length, 1024 * 1024);
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 10_000 * 1024);
});

test('chunkFromAsync - handles many tiny chunks efficiently (avoids O(n²))', async () => {
	// Same test as above but for async variant
	async function * manyTinyChunks() {
		for (let index = 0; index < 10_000; index++) {
			yield new Uint8Array(1024);
		}
	}

	const start = Date.now();
	const chunks = await collectAsyncChunks(chunkFromAsync(manyTinyChunks(), 1024 * 1024));
	const duration = Date.now() - start;

	ok(duration < 1000, `Took ${duration}ms, expected < 1000ms`);

	equal(chunks.length, 10);
	equal(chunks[0].length, 1024 * 1024);
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	equal(totalSize, 10_000 * 1024);
});
