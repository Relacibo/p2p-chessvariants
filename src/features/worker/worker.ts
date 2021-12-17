import axios from "axios";
import { DBSchema, IDBPDatabase, openDB } from "idb";
import { expose } from "threads/worker";
import {
  Coords,
  VariantDescription,
  VariantState,
} from "../../gamelogic/types";
import util from "../../gamelogic/util";
import variantDescriptionContext from "../../gamelogic/variantDescriptionContext";
import { MoveParams } from "../variant-environment/variantsSlice";

const VARIANT_WORKER_DB = "variant-worker";
const VARIANT_OBJECT_STORE = "variants";

interface VariantDBSchema extends DBSchema {
  [VARIANT_OBJECT_STORE]: {
    key: string;
    value: { uuid: string; script: string };
  };
}

export type DescriptionInfo = { name: string; description?: string };

export interface VariantsWorker {
  init(): Promise<void>;
  move(
    url: string,
    gameKey: string,
    state: VariantState,
    params: MoveParams
  ): Promise<VariantState>;
  loadScript(url: string): Promise<string>;
  removeScript(url: string): Promise<void>;
  listScripts(): Promise<string[]>;
}

class ChessWorker implements VariantsWorker {
  variants = new Map<string, VariantDescription>();
  db: IDBPDatabase<VariantDBSchema> | null = null;
  cachedPossibleDestinations = new Map<
    string,
    { source: Coords; destinations: Coords[] }[]
  >();
  constructor() {}
  init(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // Load project variants
      const { variants: v } = variantDescriptionContext;
      for (let key in v) {
        const { description: d } = v[key];
        const { uuid } = d;
        this.variants.set(uuid, d);
      }
      await this.initializeDB();
      // Load descriptions from storage
      (await this.db?.getAll(VARIANT_OBJECT_STORE)!).forEach(
        ({ uuid, script }) => {
          try {
            const variantDescription = readInVariantDescription(script);
            this.variants.set(uuid, variantDescription);
          } catch {
            this.db?.delete(VARIANT_OBJECT_STORE, uuid)!;
          }
        }
      );
      resolve();
    });
  }
  async initializeDB() {
    this.db = await openDB(VARIANT_WORKER_DB, 1, {
      upgrade(db) {
        db.createObjectStore(VARIANT_OBJECT_STORE, {
          keyPath: "uuid",
        });
      },
    });
  }
  move(
    url: string,
    gameKey: string,
    state: VariantState,
    params: MoveParams
  ): Promise<VariantState> {
    return new Promise((resolve, reject) => {
      const { source, destination, playerIndex } = params;
      /* Lookup if move is allowed */
      const description = this.variants.get(url);
      if (!description) {
        reject("Description not available!");
        return;
      }
      if (
        (typeof state.onMoveIndex == "number" &&
          state.onMoveIndex != playerIndex) ||
        (Array.isArray(state.onMoveIndex) &&
          !state.onMoveIndex.includes(playerIndex)) ||
        util.getPieceAt(state, source)?.color !=
          description.playerIndex2Color(playerIndex)
      ) {
        reject("Preconditions not met!");
        return;
      }
      let possibleDestinationsArray =
        this.cachedPossibleDestinations.get(gameKey);
      let possibleDestinations: Coords[] | undefined;
      if (typeof possibleDestinationsArray !== "undefined") {
        possibleDestinations = possibleDestinationsArray.find(
          ({ source: s }) => {
            s.equals(source);
          }
        )?.destinations;
      }

      if (typeof possibleDestinations === "undefined") {
        possibleDestinations = getPossibleDestinations(
          description,
          state,
          source,
          playerIndex
        );
      }

      let dst = typeof possibleDestinations.find((d) => destination.equals(d));
      if (dst === "undefined") {
        reject("Move not possible!");
        return;
      }
      let newState: VariantState | null = null;
      try {
        newState = description.move(state, source, destination, playerIndex);
        if (newState === null) {
          reject("Returned state is null!");
          return;
        }
      } catch (e) {
        reject("Error executing move!");
        return;
      }
      resolve(newState);
    });
  }
  loadScript(url: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let data: string;
      try {
        data = (await axios.get(url)).data;
      } catch {
        reject("Could not fetch variant url!");
        return;
      }
      try {
        const variantDescription: VariantDescription =
          readInVariantDescription(data);
        const { uuid } = variantDescription;
        this.variants.set(uuid, variantDescription);

        this.db!.add(VARIANT_OBJECT_STORE, {
          uuid,
          script: data,
        });
        resolve(uuid);
      } catch (e) {
        reject(e);
      }
    });
  }
  removeScript(uuid: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.db!.delete(VARIANT_OBJECT_STORE, uuid);
        this.variants.delete(uuid);
        resolve();
      } catch {
        reject("Could not delete!");
      }
    });
  }
  listScripts(): Promise<string[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const scripts = await this.db!.getAllKeys(VARIANT_OBJECT_STORE);
        resolve(scripts);
      } catch {
        reject("Could find scripts!");
      }
    });
  }
}

function readInVariantDescription(script: string): VariantDescription {
  const context = variantDescriptionContext;
  let resolved: VariantDescription | null = null;
  const resolve = (desc: VariantDescription) => {
    resolved = desc;
  };
  new Function("context", "resolve", script)(context, resolve);
  if (resolved == null) {
    throw "Variant description is not defined!";
  }
  return resolved;
}

function getPossibleDestinations(
  description: VariantDescription,
  state: VariantState,
  source: Coords,
  playerIndex: number
): Coords[] {
  return [];
}

expose(new ChessWorker() as any);
