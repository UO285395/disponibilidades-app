import { adminAPI } from "./adminApi.js";

// El árbol del organigrama lo necesitan varios componentes a la vez (los
// selectores de ámbito, el formulario de eventos...). Sin esto, cada instancia
// hacía su propia petición idéntica: una pantalla con dos selectores pedía el
// árbol dos veces al montarse.
//
// Cachea el resultado un rato y, sobre todo, deduplica las peticiones en vuelo:
// si tres componentes lo piden a la vez, sale UNA sola petición.

const TTL_MS = 60_000;

let cached = null;
let cachedAt = 0;
let inflight = null;

export function getOrgTree({ force = false } = {}) {
  const now = Date.now();

  if (!force && cached && now - cachedAt < TTL_MS) {
    return Promise.resolve(cached);
  }
  if (inflight) return inflight;

  inflight = adminAPI.orgTree()
    .then((tree) => {
      cached = tree;
      cachedAt = Date.now();
      return tree;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

// A llamar tras crear/renombrar/mover/eliminar unidades, para que los
// selectores no muestren una estructura obsoleta.
export function invalidateOrgTree() {
  cached = null;
  cachedAt = 0;
}
