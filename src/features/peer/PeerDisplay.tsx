import { Box, Text, TextInput } from "grommet";
import React from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { selectPeerId } from "./peerSlice";

const PeerDisplay = () => {
  const peerId = useSelector(selectPeerId);
  return (
    <Box gap="xsmall">
      <Text margin={{ left: "xsmall" }} color="accent-1">
        Peer ID
      </Text>
      <TextInput
        readOnly
        width="auto"
        value={peerId}
        style={{ cursor: "pointer", fontSize: "0.8em" }}
        onClick={() => {
          if (typeof peerId !== "undefined") {
            navigator.clipboard.writeText(peerId);
            toast.info(`Copied peer id to clipboard!`);
          }
        }}
      />
    </Box>
  );
};
export default PeerDisplay;
