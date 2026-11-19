// Tiny client-side registry so PersonaContext can call Clerk's signOut
// without importing @clerk/nextjs when Clerk is not the live provider.

type SignOutFn = () => Promise<void>;

let impl: SignOutFn | null = null;

export function registerClerkSignOut(fn: SignOutFn | null): void {
  impl = fn;
}

export async function runClerkSignOut(): Promise<void> {
  if (impl) await impl();
}
