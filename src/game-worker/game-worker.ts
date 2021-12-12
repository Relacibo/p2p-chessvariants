import { expose } from "threads";

export interface WorkerFunctions {
}

const workerFunctions: WorkerFunctions = {
  test() {

  }
}

expose(workerFunctions as any)

const temporaryVariantDescriptions = new Map<DescriptionLocation, VariantDescription>();


const getDescription = (location: DescriptionLocation): AppThunk<Promise<VariantDescription | null>> => {
  return async (dispatch, getState) => {
    let description = temporaryVariantDescriptions.get(location);
    if (typeof description !== "undefined") {
      return description;
    }
    switch (location.source) {
      case "url": {
        let descriptionString = selectDescriptions(getState()).get(location)?.description;
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
          const worker: Worker = new Worker('');
          description = [] as any; //TODO
        } catch (e) {
          if (e instanceof Error) {
            toast.error(e.message);
          }
          return null;
        }
        assert(typeof description !== 'undefined')
        dispatch(saveVariantDescriptionInfo({
          location,
          info: { name: description.name(), description: descriptionString }
        }));
        break;
      }
      default:
        return null;
    }
    temporaryVariantDescriptions.set(location, description);
    return description!;
  }
}

export const loadHardcodedVariants = (): AppThunk => (dispatch, _getState) => {
  for (const key in hardcoded) {
    const value: VariantDescription = (hardcoded as any)[key];
    const location: DescriptionLocation = { source: "hardcoded", key }
    temporaryVariantDescriptions.set(location, value);
    dispatch(saveVariantDescriptionInfo({ location, info: { name: value.name() } }));
  }
}
