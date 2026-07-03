import { EXPLORERS, type ChainId } from "@cipher/addresses";

export const txUrl = (chainId: ChainId, hash: string) => `${EXPLORERS[chainId]}/tx/${hash}`;
export const addressUrl = (chainId: ChainId, addr: string) =>
  `${EXPLORERS[chainId]}/address/${addr}`;
export const tokenPath = (wrapper: string, action?: string, chainId?: ChainId) => {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (chainId && chainId !== 11155111) params.set("chain", String(chainId));
  const qs = params.toString();
  return `/token/${wrapper}${qs ? `?${qs}` : ""}`;
};
