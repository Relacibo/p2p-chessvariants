import axios from "axios";
import { expose } from "threads/worker";
import {
  BoardCoords,
  Coords,
  VariantDescription,
  VariantState,
} from "./gamelogic/types";
import { MoveParams } from "./variantsSlice";
import * as ls from "local-storage";
import baseVariants from "./gamelogic/baseVariants";
import { getPieceAt } from "./gamelogic/util";
import variantDescriptionContext from "./gamelogic/variantDescriptionContext";

export type DescriptionInfo = { name: string; description?: string };

const variants = new Map<string, VariantDescription>(baseVariants);
const cachedPossibleDestinations = new Map<
  string,
  { source: Coords; destinations: Coords[] }[]
>();

(() => {
  const descriptions = ls.get<{ [key: string]: string }>("variant-worker");
  let changed = false;
  for (let url in descriptions) {
    try {
      const variantDescription = createVariantDescription(descriptions[url]);
      variants.set(url, variantDescription);
    } catch {
      delete descriptions[url];
      changed = true;
    }
  }
  if (changed) {
    ls.set("variant-worker", descriptions);
  }
})();

export interface VariantsWorker {
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

const workerFunctions: VariantsWorker = {
  move(
    url: string,
    gameKey: string,
    state: VariantState,
    params: MoveParams
  ): Promise<VariantState> {
    return new Promise((resolve, reject) => {
      const { source, destination, playerIndex } = params;
      /* Lookup if move is allowed */
      const description = variants.get(url);
      if (!description) {
        reject("Description not available!");
        return;
      }
      if (
        (typeof state.onMoveIndex == "number" &&
          state.onMoveIndex != playerIndex) ||
        (Array.isArray(state.onMoveIndex) &&
          !state.onMoveIndex.includes(playerIndex)) ||
        getPieceAt(state, source)?.color !=
          description.playerIndex2Color(playerIndex)
      ) {
        reject("Preconditions not met!");
        return;
      }
      let possibleDestinationsArray = cachedPossibleDestinations.get(gameKey);
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
  },
  loadScript(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        axios.get(url).then((res) => {
          const data = res.data;
          try {
            const variantDescription: VariantDescription =
              createVariantDescription(data);
            variants.set(url, variantDescription);
            ls.set("variant-worker", data);
            resolve(variantDescription.name());
          } catch (e) {
            reject(e);
          }
        });
      } catch {
        reject("Could not fetch variant url!");
      }
    });
  },
  removeScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const scripts = ls.get<{ [key: string]: string }>("variant-worker");
        delete scripts[url];
        ls.set("variant-worker", scripts);
        variants.delete(url);
        resolve();
      } catch {
        reject("Could not delete from local storage!");
      }
    });
  },
  listScripts(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      try {
        const scripts = ls.get<{ [key: string]: string }>("variant-worker");
        resolve(Object.keys(scripts));
      } catch {
        reject("Could not read local storage!");
      }
    });
  },
};

function createVariantDescription(data: string): VariantDescription {
  let ret: VariantDescription | null = null;
  const register = (variantDescription: VariantDescription) => {
    ret = variantDescription;
  };
  const context = variantDescriptionContext;
  (new Function("context", data))({
    ...context,
    register,
  });
  if (ret == null) {
    throw "Variant description is not defined!";
  } 
  return ret; 
}

function getPossibleDestinations(
  description: VariantDescription,
  state: VariantState,
  source: Coords,
  playerIndex: number
): Coords[] {
  return [];
}

expose(workerFunctions as any);
