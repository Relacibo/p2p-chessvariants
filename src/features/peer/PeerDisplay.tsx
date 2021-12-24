import { Box, Text, TextInput } from "grommet";
import React from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { selectPeerConnectionState, selectPeerId } from "./peerSlice";

const PeerDisplay = () => {
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  let color;
  switch (peerState) {
    case "disconnected":
      color = "#CCCCCC";
      break;
    case "connecting":
      color = "#FFAA15";
      break;
    case "connected":
      color = "#00C781";
      break;
  }
  return (
    <Box gap="xsmall">
      <Text margin={{ left: "xsmall" }} color="accent-1">
        Peer ID
      </Text>
      <TextInput
        readOnly
        width="auto"
        value={peerId}
        style={{ cursor: "pointer", fontSize: "0.8em", color }}
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
