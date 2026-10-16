/*
 * Stands in for the `server-only` package under vitest.
 *
 * The real package throws when a server module is imported from a client
 * component, which is the point of it. A test runner has no such split — these
 * tests import the server modules on purpose — so the marker is stubbed and the
 * modules themselves load normally.
 */

export {};