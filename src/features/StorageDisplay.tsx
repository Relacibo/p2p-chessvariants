import { Box, Meter, Stack, Text } from "grommet";
import { useEffect, useState } from "react";

type StorageObject =
  | { type: "loading" }
  | {
      type: "failed";
    }
  | {
      type: "object";
      obj: StorageEstimate;
    };

function StorageDisplay() {
  const [storageObject, setStorageObject] = useState<StorageObject>({
    type: "loading",
  });

  const update = async () => {
    if (!("storage" in navigator) || !("estimate" in navigator.storage)) {
      setStorageObject({
        type: "failed",
      });
      return;
    }
    setStorageObject({ type: "loading" });
    try {
      const obj = await navigator.storage.estimate();
      setStorageObject({ type: "object", obj });
    } catch {
      setStorageObject({ type: "failed" });
    }
  };
  useEffect(() => {
    update();
  }, []);
  let value = 0;
  let displayString;
  switch (storageObject.type) {
    case "object": {
      const { quota, usage } = storageObject.obj;
      value = (usage! / quota!) * 100;
      displayString = `${value.toFixed(2).toString()}%`;
      break;
    }
    case "loading": {
      displayString = null;
      break;
    }
    case "failed": {
      displayString = "N/A";
      break;
    }
  }
  return (
    <Box align="center" pad="large">
      <Stack anchor="center">
        <Meter
          type="circle"
          size="xsmall"
          thickness="small"
          values={[
            {
              value,
              label: "disk usage",
              color: value > 90 ? "accent-2" : "accent-1",
            },
          ]}
          aria-label="meter"
        />
        {displayString && (
          <Box direction="row" align="center" pad={{ bottom: "xsmall" }}>
            <Text size="xlarge" weight="bold">
              {displayString}
            </Text>
            <Text size="small"></Text>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

export default StorageDisplay;
