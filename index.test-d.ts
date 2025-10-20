import {Readable} from 'node:stream';
import {expectType, expectAssignable} from 'tsd';
import {chunk, chunkFrom, chunkFromAsync} from './index.js';

// Chunk tests
const uint8Array = new Uint8Array(1000);
const uint16Array = new Uint16Array(500);
const int32Array = new Int32Array(250);

// Returns Generator<Uint8Array>
expectType<Generator<Uint8Array, void, undefined>>(chunk(uint8Array, 65_536));
expectType<Generator<Uint8Array, void, undefined>>(chunk(uint8Array, 100));
expectType<Generator<Uint8Array, void, undefined>>(chunk(uint16Array, 1000));
expectType<Generator<Uint8Array, void, undefined>>(chunk(int32Array, 1000));

// Can be used in for...of
for (const piece of chunk(uint8Array, 65_536)) {
	expectType<Uint8Array>(piece);
}

// Can spread to array
expectAssignable<Uint8Array[]>([...chunk(uint8Array, 65_536)]);

// ChunkFrom tests
const bufferArray = [new Uint8Array(100), new Uint8Array(200)];
expectType<Generator<Uint8Array, void, undefined>>(chunkFrom(bufferArray, 100));

function * bufferGenerator(): Generator<Uint8Array> {
	yield new Uint8Array(100);
}

expectType<Generator<Uint8Array, void, undefined>>(chunkFrom(bufferGenerator(), 100));

// Can be used in for...of with iterable
for (const piece of chunkFrom(bufferArray, 100)) {
	expectType<Uint8Array>(piece);
}

// ChunkFromAsync tests
const readableStream = Readable.from(uint8Array) as AsyncIterable<Uint8Array>;

async function * asyncGenerator(): AsyncGenerator<Uint8Array> {
	yield new Uint8Array(100);
}

function * syncGenerator(): Generator<Uint8Array> {
	yield new Uint8Array(100);
}

// Returns AsyncGenerator<Uint8Array>
expectType<AsyncGenerator<Uint8Array, void, undefined>>(chunkFromAsync(readableStream, 65_536));
expectType<AsyncGenerator<Uint8Array, void, undefined>>(chunkFromAsync(readableStream, 100));
expectType<AsyncGenerator<Uint8Array, void, undefined>>(chunkFromAsync(asyncGenerator(), 65_536));
expectType<AsyncGenerator<Uint8Array, void, undefined>>(chunkFromAsync(syncGenerator(), 65_536));

// Can be used in for await...of
const testAsyncIteration = async () => {
	for await (const piece of chunkFromAsync(readableStream, 65_536)) {
		expectType<Uint8Array>(piece);
	}
};

// Generic async iterable
const asyncIter = asyncGenerator();
expectType<AsyncGenerator<Uint8Array, void, undefined>>(chunkFromAsync(asyncIter, 65_536));

// Generic iterable
const syncIter = syncGenerator();
expectType<AsyncGenerator<Uint8Array, void, undefined>>(chunkFromAsync(syncIter, 65_536));
