import { describe, it, expect } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeAbiParameters } from "viem";
import { RegistryError, toRegistryError, FAUCET_CAP_SELECTOR } from "./errors.ts";

describe("toRegistryError", () => {
  it("passes RegistryError instances through unchanged (same reference)", () => {
    const original = new RegistryError("PAIR_NOT_FOUND", "no such pair");
    expect(toRegistryError(original)).toBe(original);
  });

  it("adopts duck-typed taxonomy errors (FheError-shaped) with code and retryable", () => {
    const fheShaped = {
      code: "DECRYPTION_PENDING",
      message: "oracle has not finalized yet",
      retryable: true,
    };

    const err = toRegistryError(fheShaped);

    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("DECRYPTION_PENDING");
    expect(err.message).toBe("oracle has not finalized yet");
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(fheShaped);
  });

  it("maps objects with non-taxonomy codes to UNKNOWN", () => {
    const err = toRegistryError({ code: "NOT_A_TAXONOMY_CODE" });
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("UNKNOWN");
  });

  it("decodes the faucet-cap custom error from a viem revert carried inside a BaseError", () => {
    const requested = 1000001000000n;
    const cap = 1000000000000n;
    const raw = (FAUCET_CAP_SELECTOR +
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [requested, cap],
      ).slice(2)) as `0x${string}`;

    // Real viem error classes: the selector is unknown to the (empty) ABI, so
    // viem keeps the payload on `.raw` — exactly what nodes hand back for
    // unrecognized custom errors.
    const revert = new ContractFunctionRevertedError({
      abi: [],
      data: raw,
      functionName: "mint",
    });
    expect(revert.raw).toBe(raw);

    const wrapped = new BaseError("Execution reverted.", { cause: revert });
    expect(wrapped).toBeInstanceOf(BaseError);
    expect(wrapped.walk((x) => x instanceof ContractFunctionRevertedError)).toBe(revert);

    const err = toRegistryError(wrapped);

    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("FAUCET_CAP_EXCEEDED");
    expect(err.retryable).toBe(false);
    expect(err.message).toBe(`mint cap exceeded (${requested} > ${cap})`);
    expect(err.meta).toEqual({ requested, cap });
    expect(err.cause).toBe(wrapped);
  });

  it("leaves BaseErrors carrying an unrelated revert selector to the fallback path", () => {
    const revert = new ContractFunctionRevertedError({
      abi: [],
      data: "0xdeadbeef",
      functionName: "mint",
    });
    const wrapped = new BaseError("Execution reverted.", { cause: revert });

    const err = toRegistryError(wrapped);

    expect(err.code).toBe("UNKNOWN");
  });

  it("maps an unknown Error to UNKNOWN preserving the message", () => {
    const boom = new Error("socket hang up");

    const err = toRegistryError(boom);

    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toBe("socket hang up");
    expect(err.retryable).toBe(false);
    expect(err.cause).toBe(boom);
  });

  it('maps a "chain mismatch" message to WRONG_NETWORK', () => {
    const err = toRegistryError(
      new Error("The current chain of the wallet (id: 1) — chain mismatch"),
    );
    expect(err.code).toBe("WRONG_NETWORK");
  });
});
