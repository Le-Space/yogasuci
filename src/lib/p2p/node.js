// Node lifecycle: libp2p → Helia → OrbitDB, plus the Svelte stores the UI
// reads. Everything below the store layer is deliberately plain functions so
// it can be driven from a test without a component.
//
// Persistence is on from the start (docs/PLAN.md §2): a studio device that
// loses its ledger on reload would lose cash receipts, so blocks and OrbitDB
// state go to IndexedDB via level, not to memory.

import { get, writable } from 'svelte/store';

import { createLibp2p } from 'libp2p';
import { createHeliaLight } from 'helia';
import { withBitswap } from '@helia/bitswap';
import { withLibp2p } from '@helia/libp2p';
import { LevelBlockstore } from 'blockstore-level';
import { LevelDatastore } from 'datastore-level';
import { createOrbitDB, Identities, useIdentityProvider } from '@orbitdb/core';
import { OrbitDBWebAuthnIdentityProviderFunction } from '@le-space/orbitdb-identity-provider-webauthn-did';
import * as dagCbor from '@ipld/dag-cbor';

import { activeAccount, scoped } from '../identity/account.js';
import { askPeersForHistory, openDatabases, replicationErrors } from '../db/open.js';
import { introductionLog } from '../db/introduction-log.js';
import { createLibp2pConfig } from './libp2p-config.js';
import { createSignalling } from './session.js';
import { relayEnabled } from './relay.js';

const BLOCKSTORE_NAME = 'yoga-p2p/blocks';
const DATASTORE_NAME = 'yoga-p2p/data';

export const libp2pStore = writable(/** @type {any} */ (null));
export const orbitdbStore = writable(/** @type {any} */ (null));
export const peerIdStore = writable(/** @type {string | null} */ (null));
export const ownDidStore = writable(/** @type {string | null} */ (null));
export const signallingStore = writable(/** @type {any} */ (null));
export const connectedPeersStore = writable(/** @type {string[]} */ ([]));

/**
 * What WebRTC thinks of each connected device, by peer id.
 *
 * Separate from `connectedPeersStore` rather than folded into it, because the
 * two answer different questions and one of them is load-bearing everywhere:
 * `connectedPeersStore` is "who can this device exchange data with", which is
 * libp2p's answer, and half the app counts it. This is the health of the path
 * underneath, which is only ever display.
 *
 * The distinction shows up as amber: WebRTC reports `disconnected` for a
 * connection that has lost its path and may well get it back — a phone whose
 * radio slept usually does — while libp2p still holds the connection. That is
 * worth showing as a wait rather than as an end, and it is invisible from
 * libp2p's side alone.
 *
 * @type {import('svelte/store').Writable<Record<string, string>>}
 */
export const peerStatesStore = writable({});

/**
 * peer id → the RTCPeerConnection carrying it.
 *
 * Built from the session's `connect` event, which is the one place the two
 * arrive together: outbound sessions are keyed by session id, and inbound ones
 * are a bare set of peer connections with no peer id attached.
 *
 * @type {Map<string, RTCPeerConnection>}
 */
const peerConnections = new Map();

function publishPeerStates() {
	peerStatesStore.set(
		Object.fromEntries([...peerConnections].map(([id, pc]) => [id, pc.connectionState]))
	);
}

export const nodeStatusStore = writable(
	/** @type {{ state: 'idle' | 'starting' | 'ready' | 'error', error: string | null }} */ ({
		state: 'idle',
		error: null
	})
);

/** @type {{ libp2p: any, helia: any, orbitdb: any, blockstore: any, datastore: any, signalling: any } | null} */
let running = null;

/**
 * Start the whole stack.
 *
 * @param {object} options
 * @param {any} [options.passkeyCredential] the WebAuthn credential backing the
 *   OrbitDB identity. Required in normal use — without it the node has no DID
 *   that other devices can grant write access to.
 */
export async function startNode({ passkeyCredential = null } = {}) {
	if (running) return running;

	nodeStatusStore.set({ state: 'starting', error: null });

	try {
		// The transport needs a way to look up verified sessions, but sessions
		// need the node. The indirection resolves that: config asks the holder,
		// the holder is filled once signalling exists.
		/** @type {{ current: any }} */
		const signallingHolder = { current: null };

		const libp2p = await createLibp2p(
			createLibp2pConfig({
				getOutboundSession: (peerId) => signallingHolder.current?.getOutboundSession(peerId),
				// Read once, here, because the configuration is what a node is built
				// from — changing the setting takes effect when the node next starts,
				// and the screen says so rather than pretending it is live.
				relayOptIn: relayEnabled()
			})
		);

		const signalling = createSignalling(libp2p);
		signallingHolder.current = signalling;

		// Named for the signed-in account. Two passkeys on one device are two
		// separate stores, so the second one cannot read blocks the first pulled
		// down — which is the point, and also why this cannot wait for OrbitDB to
		// report the identity: the stores are built before it exists (#82).
		const blockstore = new LevelBlockstore(scoped(BLOCKSTORE_NAME));
		const datastore = new LevelDatastore(scoped(DATASTORE_NAME));
		await datastore.open();

		// Composed by hand rather than via createHelia: the default composition
		// adds trustless HTTP gateways and delegated routing, which would fetch
		// blocks over the public internet. Bitswap over the QR-negotiated
		// connection must be the only way a block can travel.
		const helia = withBitswap(
			withLibp2p(createHeliaLight({ blockstore, datastore, codecs: [dagCbor] }), libp2p)
		);
		await helia.start();

		const orbitdb = await createOrbitDBInstance(helia, passkeyCredential);

		running = { libp2p, helia, orbitdb, blockstore, datastore, signalling };

		libp2pStore.set(libp2p);
		orbitdbStore.set(orbitdb);
		peerIdStore.set(libp2p.peerId.toString());
		signallingStore.set(signalling);
		trackConnections(libp2p);
		trackPeerHealth(signalling);
		installDiagnostics();
		nodeStatusStore.set({ state: 'ready', error: null });

		return running;
	} catch (/** @type {any} */ error) {
		nodeStatusStore.set({ state: 'error', error: error?.message ?? String(error) });
		throw error;
	}
}

/**
 * End every peer connection, without stopping the node.
 *
 * A real need rather than a convenience: a front-desk device pairs with one
 * person after another, and a connection left open keeps replicating a student's
 * ledger long after they have walked out. Someone at the counter has to be able
 * to say "done" — and that is a privacy control, not a debug switch
 * (docs/LIMITS.md §1.3: a peer holding an address can read the whole database).
 *
 * The node keeps running and the databases stay open, so what this device already
 * knows is not lost. A new QR handshake is the only way back in.
 */
export async function hangUp() {
	get(signallingStore)?.close();

	// The signalling layer knows the sessions it created; libp2p knows every live
	// connection, including inbound ones it upgraded. Both, or a connection can
	// survive the hang-up that was supposed to end it.
	for (const connection of running?.libp2p?.getConnections() ?? []) {
		await connection.close().catch(() => {});
	}

	peerConnections.clear();
	peerStatesStore.set({});
	connectedPeersStore.set([]);
}

/**
 * End the connection to one device, leaving the others alone.
 *
 * The counter case `hangUp` cannot serve: a front desk paired with two teachers
 * and a student who is now leaving should not have to drop all three and pair
 * the other two again. Once more than one device can be connected at a time,
 * "done with this one" has to mean one.
 *
 * Both layers again, and for the same reason as in `hangUp`: closing the libp2p
 * connection while its RTCPeerConnection stays open leaves a path that can be
 * dialled straight back up.
 *
 * @param {string} peerId
 */
export async function disconnectPeer(peerId) {
	peerConnections.get(peerId)?.close();
	peerConnections.delete(peerId);

	for (const connection of running?.libp2p?.getConnections() ?? []) {
		if (connection.remotePeer.toString() !== peerId) continue;
		await connection.close().catch(() => {});
	}

	publishPeerStates();
}

export async function stopNode() {
	if (!running) return;

	get(signallingStore)?.close();
	await running.orbitdb?.stop?.();
	await running.helia?.stop?.();
	await running.libp2p?.stop?.();
	await running.datastore?.close?.();
	await running.blockstore?.close?.();

	running = null;
	libp2pStore.set(null);
	orbitdbStore.set(null);
	peerIdStore.set(null);
	ownDidStore.set(null);
	signallingStore.set(null);
	connectedPeersStore.set([]);
	nodeStatusStore.set({ state: 'idle', error: null });
}

/**
 * OrbitDB on a passkey-backed DID identity.
 *
 * The provider is registered globally as well as used locally: without the
 * registration, this device could create its own webauthn identity but could
 * not verify entries signed by another device's (docs/PLAN.md §3.1).
 *
 * @param {any} helia
 * @param {any} passkeyCredential
 */
async function createOrbitDBInstance(helia, passkeyCredential) {
	if (!passkeyCredential) {
		ownDidStore.set(null);
		return createOrbitDB({ ipfs: helia });
	}

	try {
		useIdentityProvider(OrbitDBWebAuthnIdentityProviderFunction);
	} catch {
		// Already registered in this page — harmless.
	}

	const identities = await Identities({ ipfs: helia });
	const identity = await identities.createIdentity({
		provider: OrbitDBWebAuthnIdentityProviderFunction(
			// Both casts are upstream typing gaps, not looseness of our own: the
			// provider types mark every option required though it defaults them,
			// and @orbitdb/core's createOrbitDB signature omits `identities`
			// although the implementation accepts it. Recorded in docs/LIMITS.md.
			/** @type {any} */ ({
				webauthnCredential: passkeyCredential,
				// One WebAuthn prompt per session: the signing key is encrypted at
				// rest and unlocked once through the passkey.
				encryptKeystore: true
			})
		)
	});

	// The account key and the identity have to be the same string, because one
	// names this device's storage and the other is what `isOwnStudio()` compares
	// against. Both are `WebAuthnDIDProvider.createDID(credential)` today, but if
	// that ever stops being true the failure would be silent and awful: two
	// accounts sharing a store while disagreeing about who owns what. Said out
	// loud instead.
	if (activeAccount() && identity.id !== activeAccount()) {
		throw new Error(
			`The passkey DID and the OrbitDB identity disagree (${activeAccount()} vs ${identity.id}), so this device cannot tell its accounts apart.`
		);
	}

	ownDidStore.set(identity.id);

	// The identity is handed over as created. Until 0.4.0 of the provider it could
	// not be: `signIdentity()` ran a fresh WebAuthn assertion on every call, so
	// `signatures.publicKey` and with it the document's content address changed on
	// every page load, and a local cache of the first document was the only way to
	// keep older writes acceptable to peers. Fixed upstream (issue #18), and
	// `e2e/m2-identity.spec.js` guards the property rather than the workaround.
	return createOrbitDB(/** @type {any} */ ({ ipfs: helia, identities, identity }));
}

/**
 * A read-only window onto the live node.
 *
 * Replication failures are invisible from the outside: the UI shows an empty
 * list whether the mesh never formed, the topic was never subscribed, or the
 * heads simply have not arrived yet. This exposes enough to tell those apart
 * from a test or a console, and it exposes nothing that is not already on the
 * wire — no keys, no identities, no payloads.
 */
function installDiagnostics() {
	if (typeof window === 'undefined') return;

	Object.defineProperty(window, '__yoga', {
		configurable: true,
		value: {
			peerId: () => running?.libp2p?.peerId?.toString() ?? null,
			identity: () => running?.orbitdb?.identity?.id ?? null,
			identityHash: () => running?.orbitdb?.identity?.hash ?? null,
			resolveIdentity: async (/** @type {string} */ hash) => {
				try {
					const found = await running?.orbitdb?.identities?.getIdentity(hash);
					return found ? { id: found.id, type: found.type } : null;
				} catch (/** @type {any} */ e) {
					return { error: e?.message ?? String(e) };
				}
			},
			connections: () =>
				(running?.libp2p?.getConnections() ?? []).map((/** @type {any} */ connection) => ({
					peer: connection.remotePeer.toString(),
					status: connection.status,
					multiplexer: connection.multiplexer
				})),
			/** Topics this node has subscribed to — one per open database. */
			topics: () => running?.libp2p?.services?.pubsub?.getTopics?.() ?? [],
			/** Who this node believes is listening on a topic. */
			topicPeers: (/** @type {string} */ topic) =>
				(running?.libp2p?.services?.pubsub?.getSubscribers?.(topic) ?? []).map(
					(/** @type {any} */ peer) => peer.toString()
				),
			/** Gossipsub mesh membership — empty here means heads cannot flow. */
			mesh: (/** @type {string} */ topic) => [
				...(running?.libp2p?.services?.pubsub?.mesh?.get?.(topic) ?? [])
			],
			protocols: () => running?.libp2p?.getProtocols?.() ?? [],
			/**
			 * What WebRTC itself thinks, which is invisible from the libp2p side.
			 *
			 * A handshake that stalls does so underneath libp2p: the connection is
			 * gathering, or connecting, or has failed, and the only symptom above is
			 * a screen that never changes. Without this, diagnosing it means
			 * guessing.
			 */
			webrtc: () => {
				const session = running?.signalling;
				const describe = (/** @type {any} */ pc) => ({
					connection: pc?.connectionState ?? null,
					ice: pc?.iceConnectionState ?? null,
					gathering: pc?.iceGatheringState ?? null,
					signaling: pc?.signalingState ?? null
				});

				return {
					offers: [...(session?.offers?.values?.() ?? [])].map((/** @type {any} */ offer) => ({
						remotePeerId: offer.remotePeerId,
						...describe(offer.peerConnection)
					})),
					inbound: [...(session?.inbound?.values?.() ?? [])].map(describe)
				};
			},
			/** Failures OrbitDB's sync reported and then carried on from. */
			replicationErrors: () => replicationErrors,
			introductions: () => introductionLog,
			/**
			 * This device's own ledger and the verdict the fold reaches on it.
			 *
			 * "No ticket card" has two completely different causes — nothing
			 * replicated, or events that arrived and were then rejected — and the
			 * screen looks identical either way. The `rejected` list is what tells
			 * them apart, which is why it is worth a diagnostic of its own.
			 *
			 * The database layer is imported lazily on purpose: pulling it into this
			 * module's import graph created a cycle that broke app boot once already.
			 */
			ledger: async (/** @type {string} [studentDid] */ studentDid) => {
				const [{ ticketsDbStore, studentTicketsStore }, { foldFromDb }, { deviceRegistry }] =
					await Promise.all([
						import('../db/tickets.js'),
						import('../db/ledger-view.js'),
						import('../db/registry.js')
					]);

				// Without an argument, this device's own ledger; with one, the ledger it
				// holds for that student — the studio side of the same question.
				const db = studentDid ? get(studentTicketsStore).get(studentDid)?.db : get(ticketsDbStore);
				if (!db) return { open: false, students: [...get(studentTicketsStore).keys()] };

				const state = await foldFromDb(db);

				return {
					open: true,
					events: (await db.all()).map((/** @type {any} */ row) => ({
						id: row.value?._id,
						type: row.value?.type,
						seq: row.value?.seq ?? null,
						signer: row.value?.issuedBy?.deviceDid ?? row.value?.redeemedBy?.deviceDid ?? null
					})),
					tickets: [...state.tickets.values()].map((/** @type {any} */ ticket) => ({
						ticketId: ticket.ticketId,
						status: ticket.status,
						unitsRemaining: ticket.unitsRemaining
					})),
					rejected: state.rejected.map((/** @type {any} */ rejection) => ({
						id: rejection.event?._id,
						type: rejection.event?.type,
						reason: rejection.reason
					})),
					forks: state.forks.map((/** @type {any} */ fork) => ({
						ticketId: fork.ticketId,
						seq: fork.seq
					})),
					// The registry is half the verdict: an event signed by a device that
					// is not in it is rejected as `unknown-device`, ticket and all.
					devices: [...deviceRegistry().keys()]
				};
			},
			/** Ask peers for heads again — see `pullHistory` in db/open.js. */
			resync: async (/** @type {string} */ address) => {
				const entry = openDatabases.get(address);
				if (!entry) return 'unknown address';
				await entry.db.sync.stop();
				await entry.db.sync.start();
				return 'ok';
			},
			/** What is open here, and how much is in it. */
			databases: async () => {
				const rows = [];
				for (const [address, { key, db }] of openDatabases) {
					rows.push({
						key,
						address,
						entries: (await db.all()).length,
						// The log behind the documents view. Reported separately because
						// the two can disagree, and which one is empty says where to look:
						// nothing joined the log at all, or it joined and the view is stale.
						logEntries: await (async () => {
							try {
								let count = 0;
								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								for await (const entry of db.log.iterator()) count += 1;
								return count;
							} catch (/** @type {any} */ e) {
								return e?.message ?? String(e);
							}
						})(),
						heads: await (async () => {
							try {
								return (await db.log.heads()).length;
							} catch (/** @type {any} */ e) {
								return e?.message ?? String(e);
							}
						})(),
						// Who OrbitDB's sync believes it is exchanging heads with.
						syncPeers: [...(db.sync?.peers ?? [])].map(String),
						writers: await (async () => {
							try {
								const c = await db.access?.capabilities?.();
								return {
									write: [...(c?.write ?? [])].map(String),
									admin: [...(c?.admin ?? [])].map(String)
								};
							} catch (/** @type {any} */ e) {
								return { error: e?.message ?? String(e) };
							}
						})()
					});
				}
				return rows;
			}
		}
	});
}

/**
 * Keep `peerStatesStore` in step with what WebRTC is doing.
 *
 * @param {any} signalling
 */
function trackPeerHealth(signalling) {
	signalling.onConnect((/** @type {any} */ event) => {
		const { peerId, peerConnection } = event.detail;
		if (!peerId || !peerConnection) return;

		peerConnections.set(peerId, peerConnection);
		// Republish on every change rather than polling: `disconnected` is exactly
		// the state nobody is looking at the screen for, and a poll would show it
		// late or not at all.
		peerConnection.addEventListener('connectionstatechange', publishPeerStates);
		publishPeerStates();
	});
}

/** @param {any} libp2p */
function trackConnections(libp2p) {
	const update = () => {
		const peers = [
			...new Set(libp2p.getConnections().map((/** @type {any} */ c) => c.remotePeer.toString()))
		];

		// Drop the health of a peer libp2p no longer holds, or the map would grow
		// for the lifetime of the page — a front desk pairs with one person after
		// another, so this is the normal case rather than the leak-shaped edge one.
		for (const peerId of peerConnections.keys()) {
			if (!peers.includes(peerId)) peerConnections.delete(peerId);
		}

		connectedPeersStore.set(peers);
		publishPeerStates();
	};

	libp2p.addEventListener('connection:open', update);
	libp2p.addEventListener('connection:close', update);

	// A new peer is the one moment there is something new to learn, and the moment
	// OrbitDB does least about it — see askPeersForHistory. Delayed a little so the
	// gossipsub subscriptions have been exchanged before anyone asks.
	libp2p.addEventListener('connection:open', () => {
		setTimeout(() => {
			askPeersForHistory().catch((error) => {
				console.warn('Could not ask a new peer for history:', error);
			});
		}, 1_500);
	});

	update();
}
