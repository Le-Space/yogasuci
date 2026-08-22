// Handing a studio's database addresses to a device that just connected.
//
// The QR handshake produces a libp2p connection and nothing else — the two
// devices still know nothing about each other's data. This protocol closes
// that gap: the studio device answers with the addresses of its registry and
// programme, and the joining device opens them.
//
// Why addresses travel here and not inside the QR payload: an OrbitDB address
// is ~60 characters, two of them plus a name would eat a quarter of the QR
// budget (docs/LIMITS.md §1.6) for data that is only needed *after* the
// connection exists anyway.
//
// This is deliberately read-only. Joining tells a device where to look; it
// grants nothing. Write access is a registry entry plus an ACL grant, and that
// is T2.3 and T3.1.

import { peerIdFromString } from '@libp2p/peer-id';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

export const STUDIO_PROTOCOL = '/yoga/studio/1.0.0';

/**
 * The other direction: a device telling the studio who it is.
 *
 * A separate protocol rather than a reply on the studio stream, because these
 * streams have no half-close — only `close()`, which shuts the writable end and
 * then waits for the remote. Two one-way exchanges are trivially correct;
 * a request/response over one stream would need careful choreography for no
 * gain at this size.
 */
export const DEVICE_HELLO_PROTOCOL = '/yoga/device-hello/1.0.0';

/** A joining device should never be asked to buffer more than this. */
const MAX_ANNOUNCEMENT_BYTES = 8 * 1024;
const READ_TIMEOUT_MS = 15_000;

/**
 * @typedef {object} StudioAnnouncement
 * @property {string} protocolVersion
 * @property {string | null} studioName
 * @property {string} ownerDid
 * @property {string} registryAddress
 * @property {string} programAddress
 */

/**
 * Answer joining devices with this studio's addresses.
 *
 * Registered once per node. The callback is asked for the current state on
 * every request rather than closing over it, so a studio that is renamed or
 * whose databases are reopened does not keep announcing stale addresses.
 *
 * @param {any} libp2p
 * @param {() => StudioAnnouncement | null} describe
 */
export async function serveStudio(libp2p, describe) {
	await libp2p.handle(
		STUDIO_PROTOCOL,
		async (/** @type {any} */ stream) => {
			try {
				const announcement = describe();

				// A device with no studio of its own still answers, with an explicit
				// "nothing here". Silence would be indistinguishable from a hang.
				const payload = announcement ?? { protocolVersion: '1.0.0', studio: null };

				stream.send(uint8ArrayFromString(JSON.stringify(payload)));
				await stream.close();
			} catch (error) {
				stream.abort?.(error);
			}
		},
		{ maxInboundStreams: 8 }
	);
}

/** @param {any} libp2p */
export async function stopServingStudio(libp2p) {
	await libp2p.unhandle(STUDIO_PROTOCOL).catch(() => {});
	await libp2p.unhandle(DEVICE_HELLO_PROTOCOL).catch(() => {});
}

/**
 * Listen for devices introducing themselves.
 *
 * An introduction is a claim, not a credential: it says "this peer says its DID
 * is X". Nothing is granted here. The owner sees the claim, decides, and writes
 * the registry entry — and from then on the DID is what signatures are checked
 * against, so a lie would simply produce events nobody can verify.
 *
 * @param {any} libp2p
 * @param {(hello: { peerId: string, did: string, label: string, publicKey: string, encryptionKey: string, bookingsAddress: string | null }) => void} onHello
 */
export async function listenForDevices(libp2p, onHello) {
	await libp2p.handle(
		DEVICE_HELLO_PROTOCOL,
		async (/** @type {any} */ stream, /** @type {any} */ connection) => {
			try {
				const hello = JSON.parse(await readAll(stream));
				if (typeof hello?.did !== 'string' || !hello.did) return;

				onHello({
					peerId: String(connection.remotePeer),
					did: hello.did,
					label: typeof hello.label === 'string' ? hello.label.slice(0, 120) : '',
					// The signing key, not the DID: the DID comes from the passkey, the
					// signing key from OrbitDB's keystore, and only the latter can
					// verify a ledger event's signature.
					publicKey: typeof hello.publicKey === 'string' ? hello.publicKey : '',
					// A second key, and a different job: this one receives rather than
					// verifies. A passkey cannot be encrypted to, so a device makes an
					// ECDH pair of its own and publishes the public half, which is what
					// lets a studio wrap a database key for it later (#95).
					encryptionKey: typeof hello.encryptionKey === 'string' ? hello.encryptionKey : '',
					// No ledger address: a ticket ledger belongs to the studio, and its
					// address is derived from this DID rather than taken on trust
					// (src/lib/db/studio-acl.js). Accepting one here would let whoever
					// is standing at the counter choose which books get written.
					bookingsAddress: typeof hello.bookingsAddress === 'string' ? hello.bookingsAddress : null
				});
			} catch (error) {
				console.warn('Malformed device introduction ignored:', error);
			} finally {
				await stream.close().catch(() => {});
			}
		},
		{ maxInboundStreams: 8 }
	);
}

/**
 * Introduce this device to a studio.
 *
 * @param {any} libp2p
 * @param {string | any} peerId
 * @param {{ did: string, label: string, publicKey?: string, encryptionKey?: string, bookingsAddress?: string | null }} self
 */
export async function introduceSelf(libp2p, peerId, self) {
	const peer = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId;

	const stream = await libp2p.dialProtocol(peer, DEVICE_HELLO_PROTOCOL, {
		signal: AbortSignal.timeout(READ_TIMEOUT_MS)
	});

	try {
		stream.send(uint8ArrayFromString(JSON.stringify(self)));
	} finally {
		await stream.close().catch(() => {});
	}
}

/**
 * Ask a connected peer which studio it belongs to.
 *
 * @param {any} libp2p
 * @param {string | any} peerId the peer from the QR handshake
 * @returns {Promise<StudioAnnouncement | null>} null when that peer has no studio
 */
export async function requestStudio(libp2p, peerId) {
	// A bare string is read as a multiaddr by libp2p and fails deep inside with
	// "getComponents is not a function" — parse it into a PeerId first, so
	// dialProtocol reuses the connection the QR handshake already opened.
	const peer = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId;

	const stream = await libp2p.dialProtocol(peer, STUDIO_PROTOCOL, {
		signal: AbortSignal.timeout(READ_TIMEOUT_MS)
	});

	try {
		const text = await readAll(stream);
		const payload = JSON.parse(text);

		if (!payload?.registryAddress || !payload?.programAddress) return null;
		return payload;
	} finally {
		await stream.close().catch(() => {});
	}
}

/**
 * Read a stream to its end.
 *
 * The announcement is small, but "small" is the sender's claim, not a fact —
 * so the read is bounded. A peer that keeps talking gets cut off rather than
 * being allowed to grow the buffer without limit.
 *
 * @param {AsyncIterable<Uint8Array | { subarray: () => Uint8Array }>} stream
 * @returns {Promise<string>}
 */
async function readAll(stream) {
	/** @type {Uint8Array[]} */
	const chunks = [];
	let total = 0;

	for await (const chunk of stream) {
		const bytes = chunk instanceof Uint8Array ? chunk : chunk.subarray();
		total += bytes.byteLength;
		if (total > MAX_ANNOUNCEMENT_BYTES) {
			throw new Error('The other device sent an implausibly large studio announcement.');
		}
		chunks.push(bytes);
	}

	const joined = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return uint8ArrayToString(joined);
}
