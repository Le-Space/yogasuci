// Create-or-recover flow for the WebAuthn passkey identity.
//
// TODO(upstream): this flow only exists as demo code in
// @le-space/orbitdb-identity-provider-webauthn-did (examples/). Once it is
// exported there as an official helper, replace this module with that import.
//
// Recovery order (mirrors the provider's documented layers):
//   1. largeBlob — identity metadata stored inside the passkey itself,
//      readable through a discoverable WebAuthn assertion.
//   2. localStorage — the serialized credential stored at registration time.
//
// The passkey is bound to the page origin (rpId). A credential created on
// localhost cannot be used on simple-todo.le-space.de or an IPFS gateway —
// see the chapter README.
import {
	WebAuthnDIDProvider,
	createDidLargeBlobPayload,
	parseDidLargeBlobPayload,
	writeLargeBlobMetadata,
	readLargeBlobMetadata,
	storeWebAuthnCredential,
	loadWebAuthnCredential,
	clearWebAuthnCredential
} from '@le-space/orbitdb-identity-provider-webauthn-did';

// Named for this app. It read `simpleTodo.webauthnCredential` until now — a
// leftover from the branch this project was scaffolded from, and the kind of thing
// that becomes permanent the moment anyone has real data under it.
const CREDENTIAL_STORAGE_KEY = 'yoga-p2p.passkeyCredential';

/**
 * Register a brand-new passkey and persist its identity metadata for later
 * recovery (largeBlob first, localStorage always).
 *
 * @param {{ userId: string, displayName: string }} options
 * @returns {Promise<any>} the WebAuthn credential for the identity provider
 */
export async function createPasskeyCredential({ userId, displayName }) {
	// The provider's published types mark every option as required and return
	// bare `Object`, although the implementation defaults all of them. Casting
	// at the boundary keeps the rest of the file typed; the typing gap is an
	// upstream item in docs/LIMITS.md, not something to patch locally.
	const credential = /** @type {any} */ (
		await WebAuthnDIDProvider.createCredential(/** @type {any} */ ({ userId, displayName }))
	);

	// localStorage fallback first — it never fails for platform reasons.
	storeWebAuthnCredential(credential, CREDENTIAL_STORAGE_KEY);

	// Best effort: put the metadata into the authenticator's largeBlob so the
	// identity survives a cleared browser profile. Costs one extra WebAuthn
	// prompt right after registration; not every authenticator supports it.
	try {
		// Both functions are called the way they are actually implemented, and both
		// casts exist because 0.4.0's `types/index.d.ts` disagrees with its own
		// `src/`: it declares `createDidLargeBlobPayload(credentialInfo)` and
		// `writeLargeBlobMetadata(credentialId, payload, options?)`, while the
		// implementation takes `(credential, did)` and a single options object
		// (`src/webauthn/large-blob-metadata.js`). Following the types would break at
		// runtime, so the runtime wins and the mismatch is recorded in
		// docs/LIMITS.md §2.2 instead of being papered over here.
		const payload = /** @type {any} */ (createDidLargeBlobPayload)(credential, credential.did);
		await /** @type {any} */ (writeLargeBlobMetadata)({
			credentialId: credential.rawCredentialId,
			payload
		});
	} catch (error) {
		console.warn('largeBlob write skipped (falling back to localStorage only):', error);
	}

	return credential;
}

/**
 * Recover a previously registered passkey identity.
 *
 * @returns {Promise<any | null>} the credential, or null when nothing found
 */
export async function recoverPasskeyCredential() {
	try {
		// Declared as `Promise<unknown>` upstream though it resolves to `{ blob }`.
		const { blob } = /** @type {any} */ (
			await readLargeBlobMetadata(/** @type {any} */ ({ discoverableCredentials: true }))
		);
		if (blob?.length) {
			const payload = /** @type {any} */ (parseDidLargeBlobPayload(blob));
			const credential = payload?.credential ?? payload;
			if (credential?.did) {
				// Refresh the local fallback so the next recovery works offline of largeBlob.
				storeWebAuthnCredential(credential, CREDENTIAL_STORAGE_KEY);
				return credential;
			}
			console.warn('largeBlob held no usable identity; falling back to local storage.');
		} else {
			// Said out loud, because an *empty* blob and a *failed read* are different
			// problems with the same symptom, and only one of them throws. This is the
			// quiet one: it is what the CDP virtual authenticator does (docs/LIMITS.md
			// §2.5), and on a real device it would mean the recovery path is not
			// actually there — worth knowing before somebody loses a phone.
			console.warn('No identity in the authenticator largeBlob; trying local storage.');
		}
	} catch (error) {
		console.warn('largeBlob recovery unavailable, trying localStorage:', error);
	}

	return loadWebAuthnCredential(CREDENTIAL_STORAGE_KEY);
}

/**
 * The DID a credential resolves to.
 *
 * Not a property of the credential, which is the trap: `credential.did` reads
 * as though it were one and is undefined, so a boot that trusted it named this
 * device's storage after nothing at all. The provider derives the DID from the
 * credential's public key, and `getId()` — the value `isOwnStudio()` later
 * compares against — is this same call. Asking for it here is what lets the
 * account be known before the node starts, which the OrbitDB stores need
 * because they are named for it (#82).
 *
 * @param {any} credential
 * @returns {Promise<string>}
 */
export async function didForCredential(credential) {
	return /** @type {any} */ (WebAuthnDIDProvider).createDID(credential);
}

/** True when a serialized credential exists in this browser profile. */
export function hasStoredPasskeyCredential() {
	try {
		return Boolean(loadWebAuthnCredential(CREDENTIAL_STORAGE_KEY));
	} catch {
		return false;
	}
}

/** Remove the locally stored credential (the passkey itself stays on the authenticator). */
export function forgetStoredPasskeyCredential() {
	clearWebAuthnCredential(CREDENTIAL_STORAGE_KEY);
}
