import { expose } from "threads";
import {
  BoardCoords,
  VariantDescription,
  VariantState,
} from "./gamelogic/types";
import { MoveParams } from "./variantsSlice";

export type DescriptionLocation =
  | { source: "url"; url: string }
  | { source: "hardcoded"; key: string };
export type DescriptionInfo = { name: string; description?: string };

export interface VariantsWorker {
  move(
    variantKey: string,
    oldState: VariantState,
    params: MoveParams
  ): VariantState;
  loadScript(url: string): Promise<string>;
}

const workerFunctions: VariantsWorker = {
  move(
    variantKey: string,
    oldState: VariantState,
    params: MoveParams
  ): VariantState {
    const { source, destination, playerIndex } = params;
    /* Lookup if move is allowed */
    const description = getDescription(descriptionLocation);
    if (
      !description ||
      (typeof state.onMoveIndex == "number" &&
        state.onMoveIndex != playerIndex) ||
      (Array.isArray(state.onMoveIndex) &&
        !state.onMoveIndex.includes(playerIndex)) ||
      getPieceAt(state, source)?.color !=
        description.playerIndex2Color(playerIndex)
    ) {
      return;
    }
    if (typeof possibleDestinations == "undefined") {
      possibleDestinations = description.possibleDestinations(
        state,
        source,
        playerIndex
      );
    }

    const isMovePossible =
      typeof possibleDestinations.find((possible) =>
        destination.equals(possible)
      ) != "undefined";
    if (!isMovePossible) {
      return;
    }
    let newState: VariantState | null = null;
    try {
      newState = description.move(state, source, destination, playerIndex);
      if (newState === null) {
        toast.error("Calculated state is null after making move!");
      }
    } catch (e) {
      toast.error(
        `Error executing move! ${source} -> ${destination} ${
          playerIndex ? `Player: ${playerIndex}` : ""
        }`
      );
      return;
    }
    toast(
      `Move: ${source} -> ${destination} ${
        playerIndex ? `Player: ${playerIndex}` : ""
      }`
    );
  },
};

expose(workerFunctions as any);

const temporaryVariantDescriptions = new Map<
  DescriptionLocation,
  VariantDescription
>();

const getDescription = (
  location: DescriptionLocation
): AppThunk<Promise<VariantDescription | null>> => {
  return async (dispatch, getState) => {
    let description = temporaryVariantDescriptions.get(location);
    if (typeof description !== "undefined") {
      return description;
    }
    switch (location.source) {
      case "url": {
        let descriptionString = selectDescriptions(getState()).get(
          location
        )?.description;
        if (!descriptionString) {
          let res;
          try {
            res = await axios.get(location.url);
          } catch (e) {
            toast.error("Could not fetch variant url!");
            return null;
          }
          descriptionString = res.data;
          if (!descriptionString) {
            toast.error("Could not fetch variant url!");
            return null;
          }
        }
        try {
          const worker: Worker = new Worker("");
          description = [] as any; //TODO
        } catch (e) {
          if (e instanceof Error) {
            toast.error(e.message);
          }
          return null;
        }
        assert(typeof description !== "undefined");
        dispatch(
          saveVariantDescriptionInfo({
            location,
            info: { name: description.name(), description: descriptionString },
          })
        );
        break;
      }
      default:
        return null;
    }
    temporaryVariantDescriptions.set(location, description);
    return description!;
  };
};

export const loadHardcodedVariants = (): AppThunk => (dispatch, _getState) => {
  for (const key in hardcoded) {
    const value: VariantDescription = (hardcoded as any)[key];
    const location: DescriptionLocation = { source: "hardcoded", key };
    temporaryVariantDescriptions.set(location, value);
    dispatch(
      saveVariantDescriptionInfo({ location, info: { name: value.name() } })
    );
  }
};
