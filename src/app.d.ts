declare global {
	const __APP_VERSION__: string;
	const __BUILD_DATE__: string;
	// Replaces __APP_BRANCH__, which was declared here and defined nowhere: any
	// use of it would have failed the build, so nothing used it.
	const __COMMIT__: string;
	namespace App {}
}

export {};
