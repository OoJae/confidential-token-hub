/**
 * ConfidentialTokenWrappersRegistry — read interface.
 * Source: docs.zama.org protocol-apps wrapper-registry + 02_BUILD-GUIDE.md §B.4.
 * TokenWrapperPair { address tokenAddress; address confidentialTokenAddress; bool isValid; }
 */

const pairComponents = [
  { name: "tokenAddress", type: "address" },
  { name: "confidentialTokenAddress", type: "address" },
  { name: "isValid", type: "bool" },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "getConfidentialTokenAddress",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "isValid", type: "bool" },
      { name: "confidentialToken", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getTokenAddress",
    stateMutability: "view",
    inputs: [{ name: "confidentialToken", type: "address" }],
    outputs: [
      { name: "isValid", type: "bool" },
      { name: "token", type: "address" },
    ],
  },
  {
    type: "function",
    name: "isConfidentialTokenValid",
    stateMutability: "view",
    inputs: [{ name: "confidentialToken", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getTokenConfidentialTokenPairs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "tuple[]", components: pairComponents }],
  },
  {
    type: "function",
    name: "getTokenConfidentialTokenPairsLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTokenConfidentialTokenPair",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: pairComponents }],
  },
  {
    type: "function",
    name: "getTokenConfidentialTokenPairsSlice",
    stateMutability: "view",
    inputs: [
      { name: "from", type: "uint256" },
      { name: "to", type: "uint256" },
    ],
    outputs: [{ name: "", type: "tuple[]", components: pairComponents }],
  },
  {
    type: "function",
    name: "getTokenIndex",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
