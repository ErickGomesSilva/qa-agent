import { materializeRequisitos } from "../req-source.ts";
import { registerRequirementSourceAdapter, type RequirementSourceAdapter } from "./registry.ts";

/**
 * Fonte "git": delega 100% para req-source.ts (materializeRequisitos já detecta e clona git
 * automaticamente pela forma da URL). Nenhuma mudança de comportamento.
 */
export const gitRequirementSourceAdapter: RequirementSourceAdapter = {
  kind: "git",
  async resolve(input) {
    if (!input.raw) throw new Error("Informe a URL do repositório de requisitos");
    const dir = materializeRequisitos(input.raw, { update: input.update });
    return { dir };
  },
};

registerRequirementSourceAdapter(gitRequirementSourceAdapter);
