import { describe, it, expect } from "vitest";
import { createLatestOnly } from "./latest-only";

/** Promise que so resolve quando o teste mandar — e como se encena a corrida. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createLatestOnly", () => {
  it("entrega o resultado quando ha uma chamada so", async () => {
    const latestOnly = createLatestOnly();
    await expect(latestOnly(async () => "ok")).resolves.toBe("ok");
  });

  it("descarta a resposta antiga que volta depois da nova", async () => {
    const latestOnly = createLatestOnly();
    const antiga = deferred<string>();
    const nova = deferred<string>();

    const primeira = latestOnly(() => antiga.promise);
    const segunda = latestOnly(() => nova.promise);

    // A ordem que o bug precisa: a segunda chamada volta primeiro, e so depois
    // chega a resposta da primeira.
    nova.resolve("nova");
    await expect(segunda).resolves.toBe("nova");

    antiga.resolve("antiga");
    await expect(primeira).resolves.toBeNull();
  });

  it("mantem no estado o veredito novo, e nao o ok atrasado", async () => {
    const latestOnly = createLatestOnly();
    const antiga = deferred<string>();
    const nova = deferred<string>();

    let estado = "sem reserva";
    const commit = (valor: string | null) => {
      if (valor !== null) estado = valor;
    };

    const primeira = latestOnly(() => antiga.promise).then(commit);
    const segunda = latestOnly(() => nova.promise).then(commit);

    nova.resolve("recusada");
    await segunda;
    antiga.resolve("ok");
    await primeira;

    // Sem o sequenciador, o "ok" atrasado sobrescreveria a recusa e reabriria
    // a navegacao que a recusa tinha fechado.
    expect(estado).toBe("recusada");
  });

  it("nao promove a antiga quando a chamada mais nova falha", async () => {
    const latestOnly = createLatestOnly();
    const antiga = deferred<string>();
    const nova = deferred<string>();

    const primeira = latestOnly(() => antiga.promise);
    const segunda = latestOnly(() => nova.promise);

    nova.reject(new Error("rede caiu"));
    await expect(segunda).rejects.toThrow("rede caiu");

    antiga.resolve("ok");
    await expect(primeira).resolves.toBeNull();
  });

  it("sequenciadores diferentes nao interferem um no outro", async () => {
    const um = createLatestOnly();
    const outro = createLatestOnly();
    const pendente = deferred<string>();

    const primeira = um(() => pendente.promise);
    await expect(outro(async () => "outra")).resolves.toBe("outra");

    pendente.resolve("minha");
    await expect(primeira).resolves.toBe("minha");
  });
});
