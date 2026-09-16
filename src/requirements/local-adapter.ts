import { materializeRequisitos } from "../req-source.ts";
import { registerRequirementSourceAdapter, type RequirementSourceAdapter } from "./registry.ts";

/**
 * Fonte "local": delega 100% para req-source.ts (materializeRequisitos), sem nenhuma mudança
 * de comportamento em relação ao QA-Agent atual.
 */
export const localRequirementSourceAdapter: RequirementSourceAdapter = {
  kind: "local",
  async resolve(input) {
    if (!input.raw) throw new Error("Informe a pasta de requisitos");
    const dir = materializeRequisitos(input.raw, { update: input.update });
    return { dir };
  },
};

registerRequirementSourceAdapter(localRequirementSourceAdapter);
