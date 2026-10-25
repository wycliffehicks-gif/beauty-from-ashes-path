// Conversation v1 — isolated namespace barrel.
//
// P1 scope: contract, candidate policy, source register and allowed-context
// boundary only. No routes, endpoints, stores, provider adapters or network
// calls import or use this namespace yet. Participant AI remains OFF.

export * from "./contract";
export * from "./grants";
export * from "./sources";
export * from "./context";
export * from "./policy";
export * from "./content/index";
