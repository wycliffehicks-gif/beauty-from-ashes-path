// Conversation v1 — isolated namespace barrel.
//
// P1 contract, policy, source register and context boundary, used by the
// P3a shared service (service/) behind the unlinked /conversation-preview
// developer route only. P3a uses a MOCK provider, a fixed developer-preview
// fixture owner (not authentication) and an exact-match fixture resolver
// (not semantic understanding). No public endpoint or network call exists;
// participant AI remains OFF.

export * from "./contract";
export * from "./grants";
export * from "./sources";
export * from "./context";
export * from "./policy";
export * from "./content/index";
export * from "./service/service";
export * from "./service/grant-issuer";
export * from "./service/mock-provider";
export * from "./service/mock-voice";
export * from "./service/semantic-fixtures";
