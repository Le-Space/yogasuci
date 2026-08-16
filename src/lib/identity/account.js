// Which passkey this device is signed in as, and how two of them stay apart.
//
// One device can hold more than one passkey for this site — a studio passkey at
// the counter and a personal one for the classes its owner takes elsewhere is
// the ordinary case, not an exotic one. Nothing separated them: the credential,
// the database addresses, the joined studios and the OrbitDB stores each had a
// single fixed name, so signing in with the second passkey left the *first*
// account's studio open under the second account's identity. `isOwnStudio()`
// then compared the studio's owner against the wrong DID and correctly answered
// no, which reached the screen as "you are a guest in this studio" on the very
// device that had created it (#82).
//
// So every per-account name goes through `scoped()`. The DID is the account key
// because it is what ownership is already expressed in — `studio.ownerDid`,
// `devicesStore[].deviceDid` — and because it is derivable from the credential
// before the node starts, which the OrbitDB stores need it to be.
//
// Kept free of Svelte, OrbitDB and the DOM beyond localStorage, so the rule that
// decides who can read whose data is provable in a unit test rather than only
// observable through a browser.

/**
 * The account that owns the unsuffixed names.
 *
 * Devices that existed before this file have their data under `yoga-p2p.databases`,
 * `yoga-p2p/blocks` and so on. Those names cannot be rewritten in place — an
 * IndexedDB-backed store is not renamable, and copying one means copying a
 * studio's entire history with no way to verify it landed. So the account that
 * finds that data adopts it where it lies, and only *later* accounts get a
 * suffix. The alternative — suffixing everyone — would silently abandon the
 * local-first data of every existing studio.
 */
const LEGACY_ACCOUNT_KEY = 'yoga-p2p.legacyAccount';

/** Proof that a pre-account device wrote here: the addresses of its own studio. */
const LEGACY_EVIDENCE_KEY = 'yoga-p2p.databases';

/** @type {string | null} */
let active = null;

/**
 * Sign in as `did` for the rest of this session.
 *
 * Called before the node starts, because the block and data stores are named
 * from this and are built during startup.
 *
 * @param {string} did
 */
export function setActiveAccount(did) {
	if (!did) throw new Error('An account needs a DID.');

	active = did;
	claimLegacyNames(did);
}

/** @returns {string | null} the DID this device is signed in as */
export function activeAccount() {
	return active;
}

/** For sign-out, and for tests that boot more than one account in a file. */
export function clearActiveAccount() {
	active = null;
}

/**
 * The storage name `base` takes for the signed-in account.
 *
 * @param {string} base a name that used to be a constant
 * @param {string | null} [did] the account to name it for; the active one by default
 * @returns {string}
 */
export function scoped(base, did = active) {
	if (!did) throw new Error(`No account is signed in, so there is no name for ${base}.`);
	if (did === legacyAccount()) return base;

	return `${base}:${did}`;
}

/** @returns {string | null} the account holding the unsuffixed names, if any */
export function legacyAccount() {
	try {
		return localStorage.getItem(LEGACY_ACCOUNT_KEY);
	} catch {
		return null;
	}
}

/**
 * Adopt the pre-account data, once, for whoever signs in first.
 *
 * Deliberately conditional on that data existing. A device installed after this
 * change has nothing to adopt, and giving its first account the unsuffixed names
 * anyway would make one account on every device permanently different from the
 * rest for no reason.
 *
 * @param {string} did
 */
function claimLegacyNames(did) {
	try {
		if (localStorage.getItem(LEGACY_ACCOUNT_KEY)) return;
		if (!localStorage.getItem(LEGACY_EVIDENCE_KEY)) return;

		localStorage.setItem(LEGACY_ACCOUNT_KEY, did);
	} catch {
		// Storage denied. Every account then gets a suffix, including this one,
		// which loses sight of pre-account data rather than corrupting it.
	}
}
